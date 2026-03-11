function buildArticleSummaryPrompt({ title, source, publishDate, content, notes, thoughts, tags }) {
  return `
You are an AI reading analyst.

Task: understand the article and return strict JSON only.

Article title: ${title}
Source: ${source}
Publish date: ${publishDate}
Tags: ${(tags || []).join(", ") || "None"}
User notes: ${(notes || []).join("\n- ") || "None"}
User thoughts: ${(thoughts || []).join("\n- ") || "None"}

Article content:
${content}

Return JSON:
{
  "summary": "",
  "core_arguments": ["", ""],
  "key_concepts": ["", ""],
  "actionable_insights": ["", ""]
}
`;
}

function buildKnowledgeChatPrompt({ query, context }) {
  return `
You answer questions using a personal reading knowledge base.
Use only the supplied context. If the context is insufficient, say so clearly.
Return strict JSON only.

User question:
${query}

Context:
${context}

Return JSON:
{
  "answer": "",
  "sources": [
    {
      "type": "article|note|thought|article_ai",
      "id": 0,
      "title": ""
    }
  ]
}
`;
}

function buildWeeklyReportPrompt({ dateRange, articles, notes, thoughts, starredTitles }) {
  return `
You generate a weekly learning report from a personal AI reading system.
Return strict JSON only.

Date range: ${dateRange}
Read articles:
${articles}

Notes:
${notes}

Thoughts:
${thoughts}

Starred articles:
${starredTitles}

Return JSON:
{
  "themes": ["", ""],
  "new_ideas": ["", ""],
  "changing_opinions": ["", ""],
  "recommended_topics": ["", ""]
}
`;
}

function buildTagSuggestionPrompt({
  title,
  source,
  summary,
  keyConcepts,
  notes,
  thoughts,
  existingTags,
  candidateTags,
}) {
  return `
You are an AI librarian for a personal reading system.
Suggest the most useful tags for long-term retrieval and knowledge organization.
Prefer concise tags, avoid duplicates, avoid vague tags.
Return strict JSON only.

Article title: ${title}
Source: ${source}
AI summary: ${summary || "None"}
Key concepts: ${(keyConcepts || []).join(", ") || "None"}
User notes: ${(notes || []).join("\n- ") || "None"}
User thoughts: ${(thoughts || []).join("\n- ") || "None"}
Existing tags on this article: ${(existingTags || []).join(", ") || "None"}
Existing tag pool in the product: ${(candidateTags || []).join(", ") || "None"}

Return JSON:
{
  "suggestions": [
    {
      "name": "",
      "reason": "",
      "confidence": 0.0
    }
  ]
}
`;
}

module.exports = {
  buildArticleSummaryPrompt,
  buildKnowledgeChatPrompt,
  buildWeeklyReportPrompt,
  buildTagSuggestionPrompt,
};
