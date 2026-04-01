/**
 * A single item in a message sequence.
 * Sequences are used for opening messages and question block hints.
 */
export interface SequenceItem {
  content: string;
  image_url: string | null;
  delay_ms: number;
}
