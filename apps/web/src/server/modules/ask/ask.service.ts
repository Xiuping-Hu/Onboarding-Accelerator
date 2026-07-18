import type { AskResponse } from '@onboarding/shared';
import { answerQuestion } from '../../agent';
import type { LogService } from '../../logService';
import type { AnswerProvider } from '../../openAiService';
import type { RagRetriever } from '../../ragService';
import type { AskBody } from './ask.dto';

export class AskService {
  constructor(
    private readonly rag: RagRetriever,
    private readonly answers: AnswerProvider,
    private readonly logs: LogService,
  ) {}

  ask(input: AskBody, userId: string): Promise<AskResponse> {
    return answerQuestion(input, this.rag, this.answers, this.logs, userId);
  }
}
