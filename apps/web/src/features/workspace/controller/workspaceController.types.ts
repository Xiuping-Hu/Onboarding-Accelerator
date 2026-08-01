import type {
  ChatMessage,
  GuideGraph,
  GuideStep,
  KnowledgeSource,
  OnboardingSession,
} from '@onboarding/shared';
import type { RefObject } from 'react';
import type { AccountSession } from '../api';
import type { DeleteError } from './workspaceSessionReducer';

export interface WorkspacePageMeta {
  title: string;
  subtitle: string;
  showWave: boolean;
}

export interface WorkspaceController {
  account: { label: string };
  route: {
    apiError: string | null;
    graph: GuideGraph | null;
    headingRef: RefObject<HTMLHeadingElement | null>;
    isGuideEmpty: boolean;
    isLoading: boolean;
    knowledgeMapEnabled: boolean;
    meta: WorkspacePageMeta;
    onReferenceStep: (stepId: string) => void;
    onRetry: () => void;
    sources: KnowledgeSource[];
  };
  navigation: {
    collapsed: boolean;
    effectiveCollapsed: boolean;
    isMobileViewport: boolean;
    mobileOpen: boolean;
    setCollapsed: (collapsed: boolean) => void;
    setMobileOpen: (open: boolean) => void;
  };
  assistant: {
    activeMessages: ChatMessage[];
    activeSessionId: string | null;
    deleteError: DeleteError;
    deletingSessionId: string | null;
    isMinimized: boolean;
    isRunning: boolean;
    onAddReference: () => void;
    onCreateSession: () => Promise<void>;
    onDeleteSession: (sessionId: string) => Promise<void>;
    onRemoveReference: () => void;
    onSelectSession: (sessionId: string) => void;
    onSendMessage: (message: string) => Promise<void>;
    referenceCandidate: GuideStep | null;
    referencedStep: GuideStep | null;
    sessions: OnboardingSession[];
    setMinimized: (minimized: boolean) => void;
  };
}

export interface WorkspaceControllerOptions {
  account: AccountSession;
  pathname: string;
}
