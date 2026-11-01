export abstract class Clock {
  abstract now(): Date;
  abstract sleep(milliseconds: number): Promise<void>;
}
