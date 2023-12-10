import { Logger } from "pino";
import getLogger from "../Logger";

export type DebugEvent = {
  date: Date;
  msg: string;
  state?: Record<string, any>;
  child?: Debugger;
}

export class Debugger {
  private events: DebugEvent[];
  private logger: Logger;

  // blank debug function
  private static blankDebugFn = (msg: string, state?: Record<string, any>) => {};

  constructor(public name: string, public requestId: string, public enabled = true) {
    if (enabled) {
      this.events = [];
      this.logger = getLogger(`[DEBUGGER] [${name}]`).child({ requestId });
    }
  }

  /**
   * Get child debugger
   * @param name
   * @param state
   * @returns
   */
  public child(name: string, state?: Record<string, any>): Debugger {
    if (!this.enabled) {
      return DisabledDebugger;
    }

    const child = new Debugger(name, this.requestId, this.enabled);
    this.events.push({
      date: new Date(),
      msg: name,
      child,
      state,
    });

    return child;
  }

  /**
   * Record a debug event
   * @returns
   */
  public get event(): (msg: string, state?: Record<string, any>) => void {
    if (!this.enabled) {
      return Debugger.blankDebugFn;
    }

    // return a function to trace event
    return (msg: string, state?: Record<string, any>) => {
      this.events.push({
        msg,
        state: state ? JSON.parse(JSON.stringify(state)) : null,
        date: new Date(),
      });

      this.logger.child({...(state ?? {})}).debug(msg);
    }
  }

  /**
   * Convert trace to string
   * @param prefixSpaces
   * @returns
   */
  public toString(prefixSpaces: number = 0): string | null {
    if (!this.enabled) {
      return null;
    }

    const prefix = ' '.repeat(prefixSpaces);
    let result = '';

    if (prefixSpaces === 0) {
      result += `Debug trace for request ${this.requestId}\n`;
    }

    for (const event of this.events) {
      result += `${prefix}[${event.date.toISOString()}] ${event.msg}\n`;

      if (event.state) {
        result += `${prefix}  State:\n`;
        const lines = JSON.stringify(event.state, null, 2).split('\n');
        for (const line of lines) {
          result += `${prefix}  ${line}\n`;
        }
      }

      if (event.child) {
        result += event.child.toString(prefixSpaces + 2);
      }
    }
    return result;
  }

  public toJSON(): string {
    return "<Debugger>";
  }
}

export const DisabledDebugger = new Debugger('', '', false);
