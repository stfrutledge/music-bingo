import jsPDF from 'jspdf';
import type { BingoCard, Playlist, Song } from '../types';
import logoUrl from '/logo.png?url';

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

// Cache for the logo image data
let logoDataUrl: string | null = null;

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

export async function generateCardsPDF(
  cards: BingoCard[],
  playlist: Playlist,
  options: Partial<PDFOptions> = {}
): Promise<jsPDF> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load logo image
  let logo: string | null = null;
  try {
    logo = await loadLogoImage();
  } catch (e) {
    console.warn('Could not load logo for PDF, using fallback:', e);
  }

  // A5 landscape: 210 x 148 mm
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5',
  });

  const songMap = new Map(playlist.songs.map(s => [s.id, s]));

  cards.forEach((card, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    drawCard(pdf, card, songMap, opts, logo);
  });

  return pdf;
}

function drawCard(
  pdf: jsPDF,
  card: BingoCard,
  songMap: Map<string, Song>,
  opts: PDFOptions,
  logo: string | null
): void {
  const pageWidth = 210;
  const pageHeight = 148;

  // Light background matching site's bg-secondary (#f8f9fa)
  pdf.setFillColor(248, 249, 250);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Card number in top right - larger for visibility
  pdf.setTextColor(10, 10, 10);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Card #${card.cardNumber}`, pageWidth - opts.margin, opts.margin + 4, { align: 'right' });

  // Grid dimensions - make it square
  const gap = 1.2;
  const totalGaps = gap * 4;
  const availableHeight = pageHeight - opts.margin - 6 - opts.margin; // header space + margins
  const availableWidth = opts.cardWidth;

  // Use the smaller dimension to make a square grid
  const gridSize = Math.min(availableHeight - totalGaps, availableWidth - totalGaps);
  const cellSize = gridSize / 5;

  // Center the square grid horizontally
  const gridStartX = opts.margin + (availableWidth - (cellSize * 5 + totalGaps)) / 2;
  const gridStartY = opts.margin + 6;
  const cornerRadius = 2;

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
          // White background for logo cell
          pdf.setFillColor(255, 255, 255);
          pdf.roundedRect(x, y, cellSize, cellSize, cornerRadius, cornerRadius, 'F');

          // Add logo image centered in the cell
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
          pdf.setFont('helvetica', 'bold');
          const freeText = 'FREE';
          const freeWidth = pdf.getTextWidth(freeText);
          pdf.text(freeText, x + (cellSize - freeWidth) / 2, y + cellSize / 2 + 3);
        }
      } else {
        // White cell background with subtle border
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, cellSize, cellSize, cornerRadius, cornerRadius, 'FD');

        // Get song for this slot
        const slotIndex = gridIndex > 12 ? gridIndex - 1 : gridIndex;
        const songId = card.slots[slotIndex];
        const song = songMap.get(songId);

        if (song) {
          const cellPadding = 1.5;
          const textWidth = cellSize - cellPadding * 2;

          // Song title - bold, dark text, wrap fully (no truncation)
          pdf.setTextColor(10, 10, 10);
          pdf.setFontSize(titleFontSize);
          pdf.setFont('helvetica', 'bold');

          const titleLines: string[] = pdf.splitTextToSize(song.title, textWidth);

          // Artist name - wrap fully (no truncation)
          pdf.setFontSize(artistFontSize);
          pdf.setFont('helvetica', 'normal');
          const artistLines: string[] = pdf.splitTextToSize(song.artist, textWidth);

          // Calculate total height needed
          const totalTitleHeight = titleLines.length * titleLineHeight;
          const totalArtistHeight = artistLines.length * artistLineHeight;
          const spaceBetween = 1.5;
          const totalTextHeight = totalTitleHeight + spaceBetween + totalArtistHeight;

          // Center vertically in cell
          let currentY = y + (cellSize - totalTextHeight) / 2 + titleLineHeight * 0.7;

          // Draw title lines
          pdf.setFontSize(titleFontSize);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(10, 10, 10);
          titleLines.forEach((line: string) => {
            const lineWidth = pdf.getTextWidth(line);
            pdf.text(line, x + (cellSize - lineWidth) / 2, currentY);
            currentY += titleLineHeight;
          });

          // Add space between title and artist
          currentY += spaceBetween - titleLineHeight + artistLineHeight * 0.7;

          // Draw artist lines
          pdf.setFontSize(artistFontSize);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(80, 80, 80);
          artistLines.forEach((line: string) => {
            const lineWidth = pdf.getTextWidth(line);
            pdf.text(line, x + (cellSize - lineWidth) / 2, currentY);
            currentY += artistLineHeight;
          });
        }
      }
    }
  }
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
