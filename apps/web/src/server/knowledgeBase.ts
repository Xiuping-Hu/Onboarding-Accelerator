import type { SourceProvenance } from '@onboarding/shared';

export interface RetrievalResult extends SourceProvenance {
  score: number;
}

const seedKnowledge: SourceProvenance[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    excerpt:
      'The onboarding assistant helps new teammates find people, process, and product context.',
    uri: 'kb://welcome',
    sourceType: 'knowledge_base',
  },
  {
    id: 'benefits',
    title: 'Benefits',
    excerpt: 'Benefits questions should link to the official HR knowledge base once connected.',
    uri: 'kb://benefits',
    sourceType: 'knowledge_base',
  },
  {
    id: 'first-week',
    title: 'First week checklist',
    excerpt:
      'New hires should confirm account access, meet their manager, review team rituals, and complete required training.',
    uri: 'kb://first-week',
    sourceType: 'knowledge_base',
  },
  {
    id: 'product-context',
    title: 'Product context',
    excerpt:
      'Product onboarding should cover customer problems, core workflows, current roadmap themes, and the glossary used by the team.',
    uri: 'kb://product-context',
    sourceType: 'knowledge_base',
  },
  {
    id: 'engineering-setup',
    title: 'Engineering setup',
    excerpt:
      'Engineering onboarding includes local environment setup, repository access, deployment overview, and ownership boundaries.',
    uri: 'kb://engineering-setup',
    sourceType: 'knowledge_base',
  },
];

export async function retrieveKnowledge(question: string): Promise<RetrievalResult[]> {
  const normalizedQuestion = question.toLowerCase();
  const terms = normalizedQuestion.split(/[^a-z0-9]+/).filter(Boolean);

  return seedKnowledge
    .map((source) => {
      const haystack = `${source.title} ${source.excerpt}`.toLowerCase();
      const termMatches = terms.filter((term) => haystack.includes(term)).length;
      const titleMatch = normalizedQuestion.includes(source.title.toLowerCase());
      const score = Math.min(0.95, (titleMatch ? 0.55 : 0.15) + termMatches * 0.12);

      return {
        ...source,
        score,
        confidence: score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
