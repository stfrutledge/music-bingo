import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { GameState, Playlist, GameRound, WinRecord, Song } from '../types';
import { saveGame, getGame } from '../lib/db';
import { shuffleSongOrder } from '../lib/cardGenerator';

interface GameContextState {
  game: GameState | null;
  playlist: Playlist | null;
  currentSong: Song | null;
  isLoading: boolean;
}

type GameAction =
  | { type: 'SET_GAME'; payload: { game: GameState; playlist: Playlist } }
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
  currentSong: null,
  isLoading: false,
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
      const { game, playlist } = action.payload;
      return {
        ...state,
        game,
        playlist,
        currentSong: getCurrentSong(game, playlist),
        isLoading: false,
      };
    }

    case 'CLEAR_GAME':
      return { ...initialState };

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

interface GameContextValue extends GameContextState {
  startNewGame: (playlist: Playlist, patternIds: string[]) => Promise<void>;
  loadGame: (gameId: string, playlist: Playlist) => Promise<void>;
  nextSong: () => void;
  prevSong: () => void;
  setPlaying: (playing: boolean) => void;
  recordWinner: (cardNumber: number) => void;
  advanceRound: (newPatternId: string) => void;
  endGame: () => void;
  clearGame: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Persist game state changes
  useEffect(() => {
    if (state.game) {
      saveGame(state.game);
    }
  }, [state.game]);

  const startNewGame = useCallback(async (playlist: Playlist, patternIds: string[]) => {
    dispatch({ type: 'SET_LOADING', payload: true });

    const shuffledOrder = shuffleSongOrder(playlist.songs);
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
    };

    await saveGame(game);
    dispatch({ type: 'SET_GAME', payload: { game, playlist } });
  }, []);

  const loadGame = useCallback(async (gameId: string, playlist: Playlist) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const game = await getGame(gameId);
    if (game) {
      dispatch({ type: 'SET_GAME', payload: { game, playlist } });
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
