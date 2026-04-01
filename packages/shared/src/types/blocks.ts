import type { SequenceItem } from './sequence.js';

// Block type discriminant
export type BlockType = 'message' | 'image' | 'question' | 'action' | 'map';

// Per-type config interfaces
export interface MessageBlockConfig {
  type: 'message';
  content: string;
}

export interface ImageBlockConfig {
  type: 'image';
  image_url: string;
}

export interface QuestionBlockConfig {
  type: 'question';
  clue: string;
  accepted_answers: string[];
  hints: SequenceItem[][];
}

export interface ActionBlockConfig {
  type: 'action';
  label: string;
}

export interface MapBlockConfig {
  type: 'map';
  google_maps_link: string;
}

// Discriminated union
export type BlockConfig =
  | MessageBlockConfig
  | ImageBlockConfig
  | QuestionBlockConfig
  | ActionBlockConfig
  | MapBlockConfig;
