import type { LogService } from '../../logService';

export class LogQueryService {
  constructor(private readonly logs: LogService) {}

  listRecent(limit?: number) {
    return this.logs.listRecent(limit);
  }

  summarize() {
    return this.logs.summarize();
  }
}
