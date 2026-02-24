import jsPDF from 'jspdf';
import type { BingoCard, Playlist, Song } from '../types';

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
  margin: 10,
  fontSize: 7,
  titleFontSize: 12,
};

export function generateCardsPDF(
  cards: BingoCard[],
  playlist: Playlist,
  options: Partial<PDFOptions> = {}
): jsPDF {
  const opts = { ...DEFAULT_OPTIONS, ...options };

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

    drawCard(pdf, card, songMap, opts);
  });

  return pdf;
}

function drawCard(
  pdf: jsPDF,
  card: BingoCard,
  songMap: Map<string, Song>,
  opts: PDFOptions
): void {
  const pageWidth = 210;
  const pageHeight = 148;

  // Dark navy background
  pdf.setFillColor(20, 34, 78); // #14224e
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Card title
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(opts.titleFontSize);
  pdf.setFont('helvetica', 'bold');
  pdf.text('MUSIC BINGO', opts.margin, opts.margin + 5);

  // Card number
  pdf.setFontSize(opts.titleFontSize);
  pdf.text(`#${card.cardNumber}`, pageWidth - opts.margin - 10, opts.margin + 5);

  // Grid dimensions
  const gridStartX = opts.margin;
  const gridStartY = opts.margin + 12;
  const cellWidth = opts.cardWidth / 5;
  const cellHeight = (pageHeight - gridStartY - opts.margin) / 5;

  // Draw grid
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = gridStartX + col * cellWidth;
      const y = gridStartY + row * cellHeight;

      // Cell background
      pdf.setFillColor(40, 58, 107); // #283a6b
      pdf.setDrawColor(84, 101, 145); // #546591
      pdf.rect(x, y, cellWidth, cellHeight, 'FD');

      const gridIndex = row * 5 + col;

      if (gridIndex === 12) {
        // Free space
        pdf.setFillColor(79, 70, 229); // Indigo
        pdf.rect(x, y, cellWidth, cellHeight, 'FD');

        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        const freeText = 'FREE';
        const freeWidth = pdf.getTextWidth(freeText);
        pdf.text(freeText, x + (cellWidth - freeWidth) / 2, y + cellHeight / 2 + 3);
      } else {
        // Get song for this slot
        const slotIndex = gridIndex > 12 ? gridIndex - 1 : gridIndex;
        const songId = card.slots[slotIndex];
        const song = songMap.get(songId);

        if (song) {
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(opts.fontSize);

          // Truncate and wrap text
          const maxChars = 18;
          const title = truncateText(song.title, maxChars);
          const artist = truncateText(song.artist, maxChars);

          pdf.setFont('helvetica', 'bold');
          const titleLines = pdf.splitTextToSize(title, cellWidth - 2);
          const titleY = y + cellHeight / 2 - 3;
          titleLines.forEach((line: string, i: number) => {
            const lineWidth = pdf.getTextWidth(line);
            pdf.text(line, x + (cellWidth - lineWidth) / 2, titleY + i * 3);
          });

          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(148, 163, 184); // Slate-400
          pdf.setFontSize(opts.fontSize - 1);
          const artistWidth = pdf.getTextWidth(artist);
          pdf.text(artist, x + (cellWidth - artistWidth) / 2, y + cellHeight - 3);
        }
      }
    }
  }

  // Footer
  pdf.setTextColor(148, 163, 184);
  pdf.setFontSize(6);
  pdf.text('Music Bingo Host', opts.margin, pageHeight - 3);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '...';
}

export function downloadPDF(pdf: jsPDF, filename: string): void {
  pdf.save(filename);
}

export function generateSingleCardPDF(
  card: BingoCard,
  playlist: Playlist
): jsPDF {
  return generateCardsPDF([card], playlist);
}
