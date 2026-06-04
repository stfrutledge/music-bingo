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
  margin: number;
  fontSize: number;
  titleFontSize: number;
}

const DEFAULT_OPTIONS: PDFOptions = {
  cardsPerPage: 1,
  cardWidth: 190, // A5 landscape width minus margins
  cardHeight: 125, // A5 landscape height minus margins
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
  const pageWidth = 210;
  const pageHeight = cardHeight;

  // White background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, offsetY, pageWidth, pageHeight, 'F');

  // Grid dimensions - make it square
  const gap = 1.2;
  const totalGaps = gap * 4;
  const headerSpace = 14; // Space for header SVG
  const availableHeight = pageHeight - opts.margin - headerSpace - opts.margin; // header space + margins
  const availableWidth = opts.cardWidth;

  // Use the smaller dimension to make a square grid
  const gridSize = Math.min(availableHeight - totalGaps, availableWidth - totalGaps);
  const cellSize = gridSize / 5;

  // Center the square grid horizontally
  const gridStartX = opts.margin + (availableWidth - (cellSize * 5 + totalGaps)) / 2;
  const gridStartY = offsetY + opts.margin + headerSpace;
  const cornerRadius = 2;

  // Header: MUSIC BINGO SVG and card number
  const gridEndX = gridStartX + 5 * cellSize + 4 * gap;
  const gridWidth = gridEndX - gridStartX;

  // Header SVG (aspect ratio 2400:420 = 5.71:1)
  if (header) {
    const headerAspectRatio = 2400 / 420;
    const headerWidth = gridWidth * 0.85; // 85% of grid width
    const headerHeight = headerWidth / headerAspectRatio;
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

  // Font sizes for readability in dim lighting
  const titleFontSize = 9;
  const artistFontSize = 7;
  const titleLineHeight = 3.2;
  const artistLineHeight = 2.8;

  // Draw grid with gaps
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = gridStartX + col * (cellSize + gap);
      const y = gridStartY + row * (cellSize + gap);

      const gridIndex = row * 5 + col;

      if (gridIndex === 12) {
        // Free space - use logo if available
        if (logo) {
          // Add logo image centered in the cell (no background)
          const padding = 1;
          const imgSize = Math.min(cellSize, cellSize) - padding * 2;
          const imgX = x + (cellSize - imgSize) / 2;
          const imgY = y + (cellSize - imgSize) / 2;
          pdf.addImage(logo, 'PNG', imgX, imgY, imgSize, imgSize);
        } else {
          // Fallback - green background with FREE text
          pdf.setFillColor(5, 150, 105);
          pdf.roundedRect(x, y, cellSize, cellSize, cornerRadius, cornerRadius, 'F');

          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(12);
          pdf.setFont('Inter', 'bold');
          const freeText = 'FREE';
          const freeWidth = pdf.getTextWidth(freeText);
          pdf.text(freeText, x + (cellSize - freeWidth) / 2, y + cellSize / 2 + 3);
        }
      } else {
        // Light gray cell background with subtle border
        pdf.setFillColor(248, 249, 250);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, cellSize, cellSize, cornerRadius, cornerRadius, 'FD');

        // Get song for this slot
        const slotIndex = gridIndex > 12 ? gridIndex - 1 : gridIndex;
        const songId = card.slots[slotIndex];
        const song = songMap.get(songId);

        if (song) {
          const cellPadding = 1.5;
          const textWidth = cellSize - cellPadding * 2;

          // Clean and format song title (Title Case, metadata removed)
          const cleanedTitle = toTitleCase(cleanSongTitle(song.title));
          // Clean artist name (primary artist only)
          const cleanedArtist = cleanArtistName(song.artist);

          // Song title - Roboto Condensed Bold, dark text, word-safe wrapping
          pdf.setTextColor(10, 10, 10);
          pdf.setFontSize(titleFontSize);
          pdf.setFont('RobotoCondensed', 'bold');

          const titleLines = wrapTextSafely(pdf, cleanedTitle, textWidth).slice(0, 3);

          // Artist name - word-safe wrapping
          pdf.setFontSize(artistFontSize);
          pdf.setFont('Inter', 'normal');
          const artistLines = wrapTextSafely(pdf, cleanedArtist, textWidth).slice(0, 2);

          // Calculate total height needed
          const totalTitleHeight = titleLines.length * titleLineHeight;
          const totalArtistHeight = artistLines.length * artistLineHeight;
          const spaceBetween = 1.5;
          const totalTextHeight = totalTitleHeight + spaceBetween + totalArtistHeight;

          // Center vertically in cell
          let currentY = y + (cellSize - totalTextHeight) / 2 + titleLineHeight * 0.7;

          // Draw title lines
          pdf.setFontSize(titleFontSize);
          pdf.setFont('RobotoCondensed', 'bold');
          pdf.setTextColor(10, 10, 10);
          titleLines.forEach((line: string) => {
            const lineWidth = pdf.getTextWidth(line);
            pdf.text(line, x + (cellSize - lineWidth) / 2, currentY);
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
            pdf.text(line, x + (cellSize - lineWidth) / 2, currentY);
            currentY += artistLineHeight;
          });
        }
      }
    }
  }

  // Card number - to the right of bottom-right box, aligned with bottom of box
  const gridEndY = gridStartY + 5 * cellSize + 4 * gap;
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
