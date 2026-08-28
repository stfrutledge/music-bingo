import jsPDF from 'jspdf';
import type { BingoCard, Playlist, Song } from '../types';
import logoUrl from '/logo.png?url';
import headerSvgUrl from '/music-bingo-header.svg?url&v=2';
import { InterRegular, InterBold } from '../fonts/inter';
import { RobotoCondensedBold } from '../fonts/roboto-condensed';

// ============================================================================
// TEXT CLEANUP & FORMATTING (Display only - does not modify underlying data)
// ============================================================================

/**
 * Cleans song title by removing metadata like feat., remix, remaster, etc.
 */
function cleanSongTitle(title: string | number): string {
  let cleaned = String(title);

  // Remove patterns in parentheses or brackets
  const bracketPatterns = [
    /\s*[\(\[][^\)\]]*feat\.?[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*featuring[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*remix[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*radio\s*(edit|version)?[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*remaster(ed)?[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*version[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*explicit[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*clean[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*deluxe[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*anniversary[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*acoustic[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*live[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*spanish[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*extended[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*club\s*mix[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*edit[^\)\]]*[\)\]]/gi,
    /\s*[\(\[]\d{4}[^\)\]]*[\)\]]/gi, // Year tags
  ];

  for (const pattern of bracketPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove patterns after dash (e.g., "Title - Remix", "Title - Spanish Version")
  const dashPatterns = [
    /\s+-\s+remix$/gi,
    /\s+-\s+radio\s*(edit|version)?$/gi,
    /\s+-\s+remaster(ed)?$/gi,
    /\s+-\s+edit$/gi,
    /\s+-\s+spanish\s*version$/gi,
    /\s+-\s+acoustic(\s*version)?$/gi,
    /\s+-\s+live(\s*version)?$/gi,
    /\s+-\s+extended\s*mix$/gi,
    /\s+-\s+club\s*mix$/gi,
    /\s+-\s+.*version$/gi,
  ];

  for (const pattern of dashPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Extracts primary artist from multi-artist strings (display only).
 * Splits on / and returns only the first artist.
 */
function cleanArtistName(artist: string): string {
  // Split on / and take first artist
  const primary = artist.split('/')[0].trim();
  return primary;
}

/**
 * Converts string to Title Case.
 * Keeps minor words lowercase unless they're the first word.
 */
function toTitleCase(str: string): string {
  const minorWords = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor',
    'on', 'at', 'to', 'by', 'of', 'in', 'as'
  ]);

  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Always capitalize first word
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      // Keep minor words lowercase
      if (minorWords.has(word)) {
        return word;
      }
      // Capitalize other words
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Word-safe text wrapping - never splits words.
 * Only wraps at word boundaries.
 */
function wrapTextSafely(pdf: jsPDF, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = pdf.getTextWidth(testLine);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

const MAX_TITLE_LINES = 4;
const MAX_ARTIST_LINES = 2;
const MIN_TITLE_FONT_SIZE = 6;

interface CellTextLayout {
  titleFontSize: number;
  artistFontSize: number;
  titleLineHeight: number;
  artistLineHeight: number;
  titleLines: string[];
  artistLines: string[];
}

/**
 * Picks the largest font size at which title + artist fit the cell without
 * losing any words. Starts at the target size and steps down 0.5pt at a time,
 * so a pathological title shrinks instead of being silently chopped.
 */
function layoutCellText(
  pdf: jsPDF,
  title: string,
  artist: string,
  textWidth: number,
  cellHeight: number,
  targetTitleFontSize: number,
  targetArtistFontSize: number,
  spaceBetween: number
): CellTextLayout {
  let smallest: CellTextLayout | null = null;

  for (let titleFontSize = targetTitleFontSize; titleFontSize >= MIN_TITLE_FONT_SIZE; titleFontSize -= 0.5) {
    // Shrink the artist alongside the title, but more gently
    const artistFontSize = Math.max(
      5,
      targetArtistFontSize - (targetTitleFontSize - titleFontSize) * 0.8
    );
    const titleLineHeight = titleFontSize * 0.36;
    const artistLineHeight = artistFontSize * 0.4;

    pdf.setFont('RobotoCondensed', 'bold');
    pdf.setFontSize(titleFontSize);
    const titleLines = wrapTextSafely(pdf, title, textWidth);
    const widestTitleLine = Math.max(0, ...titleLines.map(l => pdf.getTextWidth(l)));

    pdf.setFont('Inter', 'normal');
    pdf.setFontSize(artistFontSize);
    const artistLines = wrapTextSafely(pdf, artist, textWidth);
    const widestArtistLine = Math.max(0, ...artistLines.map(l => pdf.getTextWidth(l)));

    const totalHeight =
      titleLines.length * titleLineHeight + spaceBetween + artistLines.length * artistLineHeight;

    smallest = {
      titleFontSize,
      artistFontSize,
      titleLineHeight,
      artistLineHeight,
      titleLines: titleLines.slice(0, MAX_TITLE_LINES),
      artistLines: artistLines.slice(0, MAX_ARTIST_LINES),
    };

    const fits =
      titleLines.length <= MAX_TITLE_LINES &&
      artistLines.length <= MAX_ARTIST_LINES &&
      totalHeight <= cellHeight - 1.5 &&
      widestTitleLine <= textWidth &&
      widestArtistLine <= textWidth;

    if (fits) return smallest;
  }

  return smallest as CellTextLayout;
}

// ============================================================================
// FONT REGISTRATION
// ============================================================================

// Register fonts globally via jsPDF events API
// This must happen before any PDF instance is created
const registerFonts = function(this: jsPDF) {
  this.addFileToVFS('Inter-Regular.ttf', InterRegular);
  this.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  this.addFileToVFS('Inter-Bold.ttf', InterBold);
  this.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  this.addFileToVFS('RobotoCondensed-Bold.ttf', RobotoCondensedBold);
  this.addFont('RobotoCondensed-Bold.ttf', 'RobotoCondensed', 'bold');
};

// Register the font callback
(jsPDF as unknown as { API: { events: Array<[string, typeof registerFonts]> } }).API.events.push(['addFonts', registerFonts]);

function verifyInterFont(pdf: jsPDF): void {
  const hasInter = 'Inter' in pdf.getFontList();
  if (!hasInter) {
    console.error('Inter font not available - falling back to Helvetica');
  }
}

interface PDFOptions {
  cardsPerPage: number;
  cardWidth: number;
  cardHeight: number;
  gridWidth: number;
  margin: number;
  fontSize: number;
  titleFontSize: number;
}

const DEFAULT_OPTIONS: PDFOptions = {
  cardsPerPage: 1,
  cardWidth: 190, // A5 landscape width minus margins
  cardHeight: 125, // A5 landscape height minus margins
  gridWidth: 155, // Cells are wider than tall - card height caps the row height,
                  // so spare width buys bigger text. Max useful value is ~200.
  margin: 8,
  fontSize: 10, // Larger font for readability in dim lighting
  titleFontSize: 14,
};

// Cache for image data
let logoDataUrl: string | null = null;
let headerDataUrl: string | null = null;

async function loadLogoImage(): Promise<string> {
  if (logoDataUrl) return logoDataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL('image/png');
        resolve(logoDataUrl);
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = (e) => {
      console.error('Failed to load logo image:', e);
      reject(new Error('Failed to load logo'));
    };
    img.src = logoUrl;
  });
}

async function loadHeaderImage(): Promise<string> {
  // Always reload header to pick up changes (no caching)
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // SVG viewBox is 2400x420 - render at 3x scale for crisp PDF output
      const scale = 3;
      const baseWidth = 2400;
      const baseHeight = 420;
      const width = baseWidth * scale;
      const height = baseHeight * scale;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        headerDataUrl = canvas.toDataURL('image/png');
        resolve(headerDataUrl);
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = (e) => {
      console.error('Failed to load header image:', e);
      reject(new Error('Failed to load header'));
    };
    img.src = headerSvgUrl;
  });
}

export async function generateCardsPDF(
  cards: BingoCard[],
  playlist: Playlist,
  options: Partial<PDFOptions> = {}
): Promise<jsPDF> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load images
  let logo: string | null = null;
  let header: string | null = null;
  try {
    logo = await loadLogoImage();
  } catch (e) {
    console.warn('Could not load logo for PDF, using fallback:', e);
  }
  try {
    header = await loadHeaderImage();
  } catch (e) {
    console.warn('Could not load header for PDF, using fallback:', e);
  }

  // US Letter portrait: 215.9 x 279.4 mm (two cards per page, stacked vertically)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  // Load Inter font
  verifyInterFont(pdf);

  const songMap = new Map(playlist.songs.map(s => [s.id, s]));
  const cardHeight = 139.7; // Half of Letter height (279.4 / 2)

  cards.forEach((card, index) => {
    const positionOnPage = index % 2; // 0 = top, 1 = bottom

    // Add new page if needed (but not for first card)
    if (index > 0 && positionOnPage === 0) {
      pdf.addPage();
    }

    const offsetY = positionOnPage * cardHeight;
    drawCard(pdf, card, songMap, opts, logo, header, offsetY, cardHeight);
  });

  return pdf;
}

function drawCard(
  pdf: jsPDF,
  card: BingoCard,
  songMap: Map<string, Song>,
  opts: PDFOptions,
  logo: string | null,
  header: string | null,
  offsetY: number = 0,
  cardHeight: number = 148
): void {
  const pageWidth = 215.9; // US Letter width
  const pageHeight = cardHeight;

  // White background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, offsetY, pageWidth, pageHeight, 'F');

  // Grid dimensions - cells are wider than tall. Row height is capped by the
  // card height, so the spare width goes to the cells instead of the margins.
  const gap = 1.2;
  const totalGaps = gap * 4;
  const headerSpace = 14; // Space for header SVG
  const availableHeight = pageHeight - opts.margin - headerSpace - opts.margin; // header space + margins
  const availableWidth = pageWidth - opts.margin * 2;

  const gridWidth = Math.min(opts.gridWidth, availableWidth);
  const cellWidth = (gridWidth - totalGaps) / 5;
  const cellHeight = (availableHeight - totalGaps) / 5;

  // Center the grid on the card
  const gridStartX = (pageWidth - gridWidth) / 2;
  const gridStartY = offsetY + opts.margin + headerSpace;
  const cornerRadius = 2;

  // Header: MUSIC BINGO SVG and card number
  const gridEndX = gridStartX + gridWidth;

  // Header SVG (aspect ratio 2400:420 = 5.71:1)
  if (header) {
    const headerAspectRatio = 2400 / 420;
    // Height-capped so a wider grid does not push the header into the top row
    const headerHeight = Math.min((gridWidth * 0.85) / headerAspectRatio, headerSpace + 2);
    const headerWidth = headerHeight * headerAspectRatio;
    const headerX = gridStartX + (gridWidth - headerWidth) / 2; // Center above grid
    const headerY = offsetY + opts.margin - 2;
    pdf.addImage(header, 'PNG', headerX, headerY, headerWidth, headerHeight);
  } else {
    // Fallback text if SVG fails to load
    pdf.setTextColor(10, 10, 10);
    pdf.setFontSize(16);
    pdf.setFont('times', 'bold');
    pdf.text('MUSIC BINGO', gridStartX, gridStartY - 2);
  }

  // Target font sizes for readability in dim lighting. Individual cells shrink
  // from here only when a long title would otherwise be cut off.
  const targetTitleFontSize = 10;
  const targetArtistFontSize = 8;

  // Draw grid with gaps
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = gridStartX + col * (cellWidth + gap);
      const y = gridStartY + row * (cellHeight + gap);

      const gridIndex = row * 5 + col;

      if (gridIndex === 12) {
        // Free space - use logo if available
        if (logo) {
          // Add logo image centered in the cell (no background)
          const padding = 1;
          const imgSize = Math.min(cellWidth, cellHeight) - padding * 2;
          const imgX = x + (cellWidth - imgSize) / 2;
          const imgY = y + (cellHeight - imgSize) / 2;
          pdf.addImage(logo, 'PNG', imgX, imgY, imgSize, imgSize);
        } else {
          // Fallback - green background with FREE text
          pdf.setFillColor(5, 150, 105);
          pdf.roundedRect(x, y, cellWidth, cellHeight, cornerRadius, cornerRadius, 'F');

          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(12);
          pdf.setFont('Inter', 'bold');
          const freeText = 'FREE';
          const freeWidth = pdf.getTextWidth(freeText);
          pdf.text(freeText, x + (cellWidth - freeWidth) / 2, y + cellHeight / 2 + 3);
        }
      } else {
        // Light gray cell background with subtle border
        pdf.setFillColor(248, 249, 250);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, cellWidth, cellHeight, cornerRadius, cornerRadius, 'FD');

        // Get song for this slot
        const slotIndex = gridIndex > 12 ? gridIndex - 1 : gridIndex;
        const songId = card.slots[slotIndex];
        const song = songMap.get(songId);

        if (song) {
          const cellPadding = 1.5;
          const textWidth = cellWidth - cellPadding * 2;
          const spaceBetween = 1.5;

          // Clean and format song title (Title Case, metadata removed)
          const cleanedTitle = toTitleCase(cleanSongTitle(song.title));
          // Clean artist name (primary artist only)
          const cleanedArtist = cleanArtistName(song.artist);

          // Largest size that fits this cell without dropping words
          const {
            titleFontSize,
            artistFontSize,
            titleLineHeight,
            artistLineHeight,
            titleLines,
            artistLines,
          } = layoutCellText(
            pdf,
            cleanedTitle,
            cleanedArtist,
            textWidth,
            cellHeight,
            targetTitleFontSize,
            targetArtistFontSize,
            spaceBetween
          );

          // Calculate total height needed
          const totalTitleHeight = titleLines.length * titleLineHeight;
          const totalArtistHeight = artistLines.length * artistLineHeight;
          const totalTextHeight = totalTitleHeight + spaceBetween + totalArtistHeight;

          // Center vertically in cell
          let currentY = y + (cellHeight - totalTextHeight) / 2 + titleLineHeight * 0.7;

          // Draw title lines - Roboto Condensed Bold, dark text
          pdf.setFontSize(titleFontSize);
          pdf.setFont('RobotoCondensed', 'bold');
          pdf.setTextColor(10, 10, 10);
          titleLines.forEach((line: string) => {
            const lineWidth = pdf.getTextWidth(line);
            pdf.text(line, x + (cellWidth - lineWidth) / 2, currentY);
            currentY += titleLineHeight;
          });

          // Add space between title and artist
          currentY += spaceBetween;

          // Draw artist lines - burgundy color (#9B123A)
          pdf.setFontSize(artistFontSize);
          pdf.setFont('Inter', 'normal');
          pdf.setTextColor(155, 18, 58);
          artistLines.forEach((line: string) => {
            const lineWidth = pdf.getTextWidth(line);
            pdf.text(line, x + (cellWidth - lineWidth) / 2, currentY);
            currentY += artistLineHeight;
          });
        }
      }
    }
  }

  // Card number - to the right of bottom-right box, aligned with bottom of box
  const gridEndY = gridStartY + 5 * cellHeight + 4 * gap;
  pdf.setTextColor(10, 10, 10);
  pdf.setFontSize(10);
  pdf.setFont('Inter', 'normal');
  pdf.text(`#${card.cardNumber}`, gridEndX + 2, gridEndY - 1);
}

export function downloadPDF(pdf: jsPDF, filename: string): void {
  pdf.save(filename);
}

export async function generateSingleCardPDF(
  card: BingoCard,
  playlist: Playlist
): Promise<jsPDF> {
  return generateCardsPDF([card], playlist);
}
