export type Team = 0 | 1;
export type Format = 'singles' | 'doubles';
export type PartnerMode = 'rotate' | 'fixed';
export type DeuceRule = 'one_deuce' | 'advantage' | 'no_ad';
export type MarginRule = 'first_to' | 'win_by_2';
export type ScorerMode = 'host' | 'players';

export interface Rules {
  gamesTo: 4 | 6;
  deuce: DeuceRule;
  margin: MarginRule;
  tiebreak: boolean;
  tiebreakTo: 7 | 10;
}

export interface Settings {
  name: string;
  hostName: string;
  format: Format;
  partnerMode: PartnerMode;
  courts: number;
  rules: Rules;
  scorerMode: ScorerMode;
  /** Cap on rounds; null means the default for the format. */
  maxRounds: number | null;
}

export const DEFAULT_RULES: Rules = {
  gamesTo: 4,
  deuce: 'one_deuce',
  margin: 'first_to',
  tiebreak: false,
  tiebreakTo: 7,
};

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  hostName: '',
  format: 'doubles',
  partnerMode: 'rotate',
  courts: 1,
  rules: DEFAULT_RULES,
  scorerMode: 'host',
  maxRounds: null,
};

export const MAX_PLAYERS = 16;
export const MAX_COURTS = 4;
