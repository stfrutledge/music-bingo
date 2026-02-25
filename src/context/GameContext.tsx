import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import type { GameState, Playlist, GameRound, WinRecord, Song, BingoCard, PacingEntry } from '../types';
import { saveGame, getGame, getActiveGame, getPlaylist, getCardsForPlaylist } from '../lib/db';
import { shuffleSongOrder, filterPlaylistForActiveCards } from '../lib/cardGenerator';
import { checkWin } from '../lib/winChecker';
import { getPatternById } from '../lib/patterns';

interface PotentialWinner {
  cardNumber: number;
  missingCount: number;
  missingSongIds: string[];
}

interface GameContextState {
  game: GameState | null;
  playlist: Playlist | null;
  cards: BingoCard[];
  currentSong: Song | null;
  isLoading: boolean;
  pacingEntry: PacingEntry | null;
  excludedSongIds: Set<string>;
}

type GameAction =
  | { type: 'SET_GAME'; payload: { game: GameState; playlist: Playlist; cards: BingoCard[]; pacingEntry: PacingEntry | null } }
  | { type: 'CLEAR_GAME' }
  | { type: 'CALL_SONG'; payload: string }
  | { type: 'NEXT_SONG' }
  | { type: 'PREV_SONG' }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'ADD_WINNER'; payload: WinRecord }
  | { type: 'NEXT_ROUND'; payload: string }
  | { type: 'END_GAME' }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: GameContextState = {
  game: null,
  playlist: null,
  cards: [],
  currentSong: null,
  isLoading: false,
  pacingEntry: null,
  excludedSongIds: new Set(),
};

function getCurrentSong(game: GameState | null, playlist: Playlist | null): Song | null {
  if (!game || !playlist || game.currentSongIndex >= game.shuffledSongOrder.length) {
    return null;
  }
  const songId = game.shuffledSongOrder[game.currentSongIndex];
  return playlist.songs.find(s => s.id === songId) || null;
}

function gameReducer(state: GameContextState, action: GameAction): GameContextState {
  switch (action.type) {
    case 'SET_GAME': {
      const { game, playlist, cards, pacingEntry } = action.payload;
      const excludedSongIds = new Set(pacingEntry?.excludedSongIds || []);
      return {
        ...state,
        game,
        playlist,
        cards,
        currentSong: getCurrentSong(game, playlist),
        isLoading: false,
        pacingEntry,
        excludedSongIds,
      };
    }

    case 'CLEAR_GAME':
      return { ...initialState, cards: [], excludedSongIds: new Set() };

    case 'CALL_SONG': {
      if (!state.game) return state;
      const newCalledSongs = [...state.game.calledSongIds, action.payload];
      const newGame = { ...state.game, calledSongIds: newCalledSongs };
      return {
        ...state,
        game: newGame,
      };
    }

    case 'NEXT_SONG': {
      if (!state.game || !state.playlist) return state;
      const nextIndex = state.game.currentSongIndex + 1;
      if (nextIndex >= state.game.shuffledSongOrder.length) return state;

      const nextSongId = state.game.shuffledSongOrder[nextIndex];
      const newCalledSongs = state.game.calledSongIds.includes(nextSongId)
        ? state.game.calledSongIds
        : [...state.game.calledSongIds, nextSongId];

      const newGame = {
        ...state.game,
        currentSongIndex: nextIndex,
        calledSongIds: newCalledSongs,
      };

      return {
        ...state,
        game: newGame,
        currentSong: getCurrentSong(newGame, state.playlist),
      };
    }

    case 'PREV_SONG': {
      if (!state.game || !state.playlist) return state;
      const prevIndex = Math.max(0, state.game.currentSongIndex - 1);
      const newGame = {
        ...state.game,
        currentSongIndex: prevIndex,
      };
      return {
        ...state,
        game: newGame,
        currentSong: getCurrentSong(newGame, state.playlist),
      };
    }

    case 'SET_PLAYING': {
      if (!state.game) return state;
      return {
        ...state,
        game: { ...state.game, isPlaying: action.payload },
      };
    }

    case 'ADD_WINNER': {
      if (!state.game) return state;
      const currentRound = state.game.rounds[state.game.currentRound];
      const updatedRound: GameRound = {
        ...currentRound,
        winners: [...currentRound.winners, action.payload],
      };
      const newRounds = [...state.game.rounds];
      newRounds[state.game.currentRound] = updatedRound;
      return {
        ...state,
        game: { ...state.game, rounds: newRounds },
      };
    }

    case 'NEXT_ROUND': {
      if (!state.game) return state;
      // End current round
      const currentRound = state.game.rounds[state.game.currentRound];
      const endedRound: GameRound = {
        ...currentRound,
        endedAt: Date.now(),
      };
      const newRounds = [...state.game.rounds];
      newRounds[state.game.currentRound] = endedRound;

      // Create new round
      const newRoundNum = state.game.currentRound + 1;
      const newRound: GameRound = {
        roundNumber: newRoundNum + 1,
        patternId: action.payload,
        winners: [],
        startedAt: Date.now(),
      };
      newRounds.push(newRound);

      return {
        ...state,
        game: {
          ...state.game,
          rounds: newRounds,
          currentRound: newRoundNum,
        },
      };
    }

    case 'END_GAME': {
      if (!state.game) return state;
      return {
        ...state,
        game: { ...state.game, endedAt: Date.now() },
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    default:
      return state;
  }
}

interface CardRangeOptions {
  cardRangeStart: number;
  cardRangeEnd: number;
}

interface GameContextValue extends GameContextState {
  startNewGame: (playlist: Playlist, patternIds: string[], cardRange?: CardRangeOptions) => Promise<void>;
  loadGame: (gameId: string, playlist: Playlist) => Promise<void>;
  cardsInPlay: number;
  nextSong: () => void;
  prevSong: () => void;
  setPlaying: (playing: boolean) => void;
  recordWinner: (cardNumber: number) => void;
  advanceRound: (newPatternId: string) => void;
  endGame: () => void;
  clearGame: () => void;
  potentialWinners: PotentialWinner[];
  confirmedWinners: number[];
  activeSongs: Song[];
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const hasRestoredRef = useRef(false);

  // Restore active game on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const restoreActiveGame = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });

      const activeGame = await getActiveGame();
      if (activeGame) {
        const playlist = await getPlaylist(activeGame.playlistId);
        if (playlist) {
          const cards = await getCardsForPlaylist(playlist.id);
          dispatch({ type: 'SET_GAME', payload: { game: activeGame, playlist, cards, pacingEntry: null } });
          return;
        }
      }

      dispatch({ type: 'SET_LOADING', payload: false });
    };

    restoreActiveGame();
  }, []);

  // Persist game state changes
  useEffect(() => {
    if (state.game) {
      saveGame(state.game);
    }
  }, [state.game]);

  const startNewGame = useCallback(async (playlist: Playlist, patternIds: string[], cardRange?: CardRangeOptions) => {
    dispatch({ type: 'SET_LOADING', payload: true });

    const cards = await getCardsForPlaylist(playlist.id);

    // Filter to only cards in play
    const activeCards = cardRange
      ? cards.filter(c => c.cardNumber >= cardRange.cardRangeStart && c.cardNumber <= cardRange.cardRangeEnd)
      : cards;

    // Smart playlist filtering:
    // 1. Remove songs not on any active card
    // 2. Remove low-appearing songs if doing so doesn't block any card from winning
    const allSongIds = playlist.songs.map(s => s.id);
    const { callableSongIds, removedCount } = filterPlaylistForActiveCards(activeCards, allSongIds);

    // Filter playlist to only callable songs
    const relevantSongs = playlist.songs.filter(s => callableSongIds.has(s.id));

    console.log(`Playlist filtering: ${playlist.songs.length} total songs, ${relevantSongs.length} callable (${removedCount} removed, ${activeCards.length} cards in play)`);

    const shuffledOrder = shuffleSongOrder(relevantSongs);
    const firstSongId = shuffledOrder[0];

    const game: GameState = {
      id: `game-${Date.now()}`,
      playlistId: playlist.id,
      rounds: [
        {
          roundNumber: 1,
          patternId: patternIds[0] || 'single-line-h',
          winners: [],
          startedAt: Date.now(),
        },
      ],
      currentRound: 0,
      calledSongIds: [firstSongId],
      shuffledSongOrder: shuffledOrder,
      currentSongIndex: 0,
      isPlaying: false,
      startedAt: Date.now(),
      cardRangeStart: cardRange?.cardRangeStart,
      cardRangeEnd: cardRange?.cardRangeEnd,
    };

    await saveGame(game);
    dispatch({ type: 'SET_GAME', payload: { game, playlist, cards, pacingEntry: null } });
  }, []);

  const loadGame = useCallback(async (gameId: string, playlist: Playlist) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const game = await getGame(gameId);
    if (game) {
      const cards = await getCardsForPlaylist(playlist.id);
      dispatch({ type: 'SET_GAME', payload: { game, playlist, cards, pacingEntry: null } });
    }
    dispatch({ type: 'SET_LOADING', payload: false });
  }, []);

  const nextSong = useCallback(() => {
    dispatch({ type: 'NEXT_SONG' });
  }, []);

  const prevSong = useCallback(() => {
    dispatch({ type: 'PREV_SONG' });
  }, []);

  const setPlaying = useCallback((playing: boolean) => {
    dispatch({ type: 'SET_PLAYING', payload: playing });
  }, []);

  const recordWinner = useCallback((cardNumber: number) => {
    if (!state.game) return;
    const record: WinRecord = {
      cardNumber,
      verifiedAt: Date.now(),
      songIndex: state.game.currentSongIndex,
    };
    dispatch({ type: 'ADD_WINNER', payload: record });
  }, [state.game]);

  const advanceRound = useCallback((newPatternId: string) => {
    dispatch({ type: 'NEXT_ROUND', payload: newPatternId });
  }, []);

  const endGame = useCallback(() => {
    dispatch({ type: 'END_GAME' });
  }, []);

  const clearGame = useCallback(() => {
    dispatch({ type: 'CLEAR_GAME' });
  }, []);

  // Filter cards to only those in play
  const cardsInPlayList = useMemo(() => {
    if (!state.game || !state.cards.length) return state.cards;

    const { cardRangeStart, cardRangeEnd } = state.game;
    if (!cardRangeStart || !cardRangeEnd) return state.cards;

    return state.cards.filter(
      card => card.cardNumber >= cardRangeStart && card.cardNumber <= cardRangeEnd
    );
  }, [state.game?.cardRangeStart, state.game?.cardRangeEnd, state.cards]);

  const cardsInPlay = cardsInPlayList.length;

  // Compute potential winners based on current called songs and pattern
  // Excluded songs are treated as "already marked" (dead squares)
  const potentialWinners = useMemo((): PotentialWinner[] => {
    if (!state.game || !cardsInPlayList.length) return [];

    const currentRound = state.game.rounds[state.game.currentRound];
    const pattern = getPatternById(currentRound.patternId);
    const calledSet = new Set(state.game.calledSongIds);

    const winners: PotentialWinner[] = [];

    for (const card of cardsInPlayList) {
      const result = checkWin(card, pattern, calledSet, state.excludedSongIds);

      // Include cards that have won (0 missing) or are close (1-2 missing)
      if (result.missingSlots.length <= 2) {
        winners.push({
          cardNumber: card.cardNumber,
          missingCount: result.missingSlots.length,
          missingSongIds: result.missingSongs.map(m => m.songId),
        });
      }
    }

    // Sort by missing count (winners first, then close ones)
    winners.sort((a, b) => a.missingCount - b.missingCount);

    return winners;
  }, [state.game?.calledSongIds, state.game?.currentRound, cardsInPlayList, state.excludedSongIds]);

  // Get confirmed winners for current round
  const confirmedWinners = useMemo((): number[] => {
    if (!state.game) return [];
    const currentRound = state.game.rounds[state.game.currentRound];
    return currentRound.winners.map(w => w.cardNumber);
  }, [state.game?.rounds, state.game?.currentRound]);

  // Get active songs (not excluded)
  const activeSongs = useMemo((): Song[] => {
    if (!state.playlist) return [];
    return state.playlist.songs.filter(s => !state.excludedSongIds.has(s.id));
  }, [state.playlist, state.excludedSongIds]);

  const value: GameContextValue = {
    ...state,
    startNewGame,
    loadGame,
    nextSong,
    prevSong,
    setPlaying,
    recordWinner,
    advanceRound,
    endGame,
    clearGame,
    potentialWinners,
    confirmedWinners,
    cardsInPlay,
    activeSongs,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
