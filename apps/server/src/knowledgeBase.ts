import type { KnowledgeSource } from '@onboarding/shared';

export interface RetrievalResult extends KnowledgeSource {
  score: number;
}

const seedKnowledge: KnowledgeSource[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    excerpt:
      'The onboarding assistant helps new teammates find people, process, and product context.',
    uri: 'kb://welcome',
  },
  {
    id: 'benefits',
    title: 'Benefits',
    excerpt: 'Benefits questions should link to the official HR knowledge base once connected.',
    uri: 'kb://benefits',
  },
];

export async function retrieveKnowledge(question: string): Promise<RetrievalResult[]> {
  const normalizedQuestion = question.toLowerCase();

  return seedKnowledge
    .map((source) => ({
      ...source,
      score: normalizedQuestion.includes(source.title.toLowerCase()) ? 0.9 : 0.25,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
