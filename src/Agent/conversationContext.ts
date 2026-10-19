export interface AgentConversationContext {
 lastEntity?: string;
 lastIntent?: 'search_book' | 'search_roles' | 'search_archive' | 'read_chapter';
 lastKeywords?: string[];
 lastSkill?: 'current_chapter_review' | 'next_chapter_planning' | 'discussion_with_verification' | 'passage_diagnosis' | 'passage_rewrite' | 'chapter_continuation_write';
 lastReviewChapterId?: string;
}

const CONTEXT_PRONOUN = /(这个人|这个角色|该角色|这个东西|该物品|刚才那个|(?<!其)[他她它])/;

export function resolveConversationQuery(
 query: string,
 context: AgentConversationContext
): { query: string; usedContext: boolean } {
 const entity = context.lastEntity?.trim();
 if (!entity || !CONTEXT_PRONOUN.test(query)) return { query, usedContext: false };
 return { query: query.replace(CONTEXT_PRONOUN, entity), usedContext: true };
}

export function updateConversationContext(
 context: AgentConversationContext,
 patch: Partial<AgentConversationContext>
): AgentConversationContext {
 return { ...context, ...patch };
}
