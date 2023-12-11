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

  constructor(public name: string, public requestId: string, public enabled = true) {
    if (enabled) {
      this.events = [];
    }

    this.logger = getLogger(name).child({ requestId });
  }

  /**
   * Get child debugger
   * @param name
   * @param state
   * @returns
   */
  public child(name: string, state?: Record<string, any>): Debugger {
    const child = new Debugger(name, this.requestId, this.enabled);

    if (this.enabled) {
      this.events.push({
        date: new Date(),
        msg: name,
        child,
        state,
      });
    }

    return child;
  }

  /**
   * Log message
   * @param state
   */
  private getLogger(state?: Record<string, any>): Logger {
    let logger = this.logger;
    if (state) {
      logger = this.logger.child({ _: state });
    }
    return logger;
  }

  /**
   * Record info event
   * @param msg
   * @param state
   */
  public info(msg: string, state?: Record<string, any>): void {
    this.getLogger(state).info(msg);
    this.pushEvent(msg, state);
  }

  /**
   * Record info event
   * @param msg
   * @param state
   */
  public error(msg: string, error?: Error, state?: Record<string, any>): void {
    this.getLogger({ error }).info(msg);
    this.pushEvent(msg, { error, ...state });
  }

  /**
   * Push event
   * @param msg
   * @param state
   */
  private pushEvent(msg: string, state?: Record<string, any>): void {
    if (this.enabled) {
      this.events.push({
        msg,
        state: state ? JSON.parse(JSON.stringify(state)) : null,
        date: new Date(),
      });
    }
  }

  /**
   * Record a debug event
   * @returns
   */
  public debug(msg: string, state?: Record<string, any>): void {
    if (this.enabled) {
      this.getLogger(state).debug(msg);
    }

    this.pushEvent(msg, state);
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
      result += `${prefix}\x1b[32m[${event.date.toISOString()}]\x1b[0m ${event.msg}\n`;

      if (event.state) {
        result += `${prefix}  \x1b[33mState:\x1b[0m\n`;
        const lines = JSON.stringify(event.state, null, 2).split('\n');
        for (const line of lines) {
          result += `\x1b[2m${prefix}  ${line}\x1b[0m\n`;
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
