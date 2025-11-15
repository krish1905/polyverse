// AI client for causal reasoning and narrative generation
// Uses Groq for SPEED (10-100x faster than OpenAI)

import Groq from "groq-sdk";
import { ConfidenceLevel } from "@/types/simulation";
import { PolymarketMarket } from "@/types/polymarket";

function getGroqClient() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || "dummy-key-for-build",
  });
}

export interface CausalAnalysis {
  hasCausalRelationship: boolean;
  direction: "A_to_B" | "B_to_A" | "bidirectional" | "none";
  strength: number; // 0-1
  impactDirection: "increase" | "decrease" | "neutral";
  timelag: "immediate" | "hours" | "days" | "weeks";
  explanation: string;
  confidence: ConfidenceLevel;
}

/**
 * Analyze if two markets have a causal relationship
 */
export async function analyzeCausalRelationship(
  marketA: PolymarketMarket,
  marketB: PolymarketMarket,
  outcomeA: string
): Promise<CausalAnalysis> {
  const prompt = `You are an expert analyst evaluating causal relationships between prediction markets.

Market A: "${marketA.question}"
Outcome being evaluated: ${outcomeA}
Current probability: ${(marketA.outcomePrices[marketA.outcomes.indexOf(outcomeA)] * 100).toFixed(1)}%

Market B: "${marketB.question}"
Current probabilities: ${marketB.outcomes.map((o, i) => `${o}: ${(marketB.outcomePrices[i] * 100).toFixed(1)}%`).join(", ")}

Task: Determine if Market A resolving to "${outcomeA}" would causally affect Market B.

Respond in JSON format:
{
  "hasCausalRelationship": boolean,
  "direction": "A_to_B" | "B_to_A" | "bidirectional" | "none",
  "strength": number (0-1, how strongly A affects B),
  "impactDirection": "increase" | "decrease" | "neutral",
  "timelag": "immediate" | "hours" | "days" | "weeks",
  "explanation": "2-3 sentence explanation of why/how A affects B",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}

Be rigorous. Only say there's a causal relationship if one event would logically cause the other.
Correlation is NOT causation. Consider:
- Temporal ordering (cause must precede effect)
- Logical mechanism (how would A cause B?)
- Direct vs indirect effects
- Confounding factors`;

  try {
    const groq = getGroqClient();
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b", // OpenAI model on Groq - 500 tokens/sec!
      messages: [
        {
          role: "system",
          content: "You are an expert in causal inference and prediction markets. You provide rigorous, data-driven analysis.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const analysis = JSON.parse(content);

    return {
      hasCausalRelationship: analysis.hasCausalRelationship,
      direction: analysis.direction,
      strength: analysis.strength,
      impactDirection: analysis.impactDirection,
      timelag: analysis.timelag,
      explanation: analysis.explanation,
      confidence: analysis.confidence,
    };
  } catch (error) {
    console.error("Error analyzing causal relationship:", error);
    return {
      hasCausalRelationship: false,
      direction: "none",
      strength: 0,
      impactDirection: "neutral",
      timelag: "immediate",
      explanation: "Failed to analyze relationship",
      confidence: "LOW",
    };
  }
}

/**
 * Generate explanation for a causal link
 */
export async function generateCausalExplanation(
  sourceMarket: PolymarketMarket,
  targetMarket: PolymarketMarket,
  outcome: string,
  predictedChange: number
): Promise<string> {
  const prompt = `Explain why "${sourceMarket.question}" resolving to "${outcome}" would cause "${targetMarket.question}" to change by ${(predictedChange * 100).toFixed(1)}%.

Provide a clear, concise explanation (2-3 sentences) that:
1. Explains the causal mechanism
2. Specifies the expected direction and magnitude
3. Mentions the likely timeframe

Be specific and avoid vague language.`;

  try {
    const groq = getGroqClient();
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: "You are an expert at explaining causal relationships in prediction markets clearly and concisely.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 150,
      temperature: 0.4,
    });

    return response.choices[0].message.content || "Unable to generate explanation";
  } catch (error) {
    console.error("Error generating explanation:", error);
    return "Impact expected based on historical correlations and market dynamics.";
  }
}

/**
 * Extract meaningful keywords using LLM
 */
async function extractMeaningfulKeywords(question: string): Promise<string[]> {
  try {
    const groq = getGroqClient();
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // Updated to working model
      messages: [
        {
          role: "system",
          content: "Extract 3-7 most meaningful keywords/entities that would help find related prediction markets. Return ONLY the keywords as a JSON array, no explanation."
        },
        {
          role: "user",
          content: `Extract keywords from: "${question}"\n\nRules:\n- Names, companies, technologies (OpenAI, GPT, Bitcoin, etc.)\n- Key concepts (regulation, election, policy)\n- NO dates, months, years, generic words\n- Return: ["keyword1", "keyword2", ...]`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content;
    if (content) {
      const parsed = JSON.parse(content);
      const keywords = parsed.keywords || parsed.terms || Object.values(parsed)[0] || [];
      
      if (Array.isArray(keywords) && keywords.length > 0) {
        console.log(`[Keywords] LLM extracted from "${question.substring(0, 60)}":`, keywords);
        return keywords.map(k => String(k).toLowerCase());
      }
    }
  } catch (error) {
    console.error('[Keywords] LLM extraction failed:', error);
  }
  
  // Fallback: extract ONLY proper nouns and meaningful words
  const stopwords = new Set(['will', 'the', 'be', 'in', 'at', 'to', 'for', 'of', 'and', 'or', 'by', 'on', 'with']);
  const properNouns = question.match(/\b[A-Z][a-z]+\b/g) || [];
  const keywords = properNouns.map(n => n.toLowerCase()).filter(n => !stopwords.has(n) && n.length >= 3);
  
  // Also add significant lowercase words (4+ chars, not stopwords, not dates)
  const words = question.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ''));
  words.forEach(w => {
    if (w.length >= 4 && !stopwords.has(w) && !/^20\d{2}$/.test(w) && !/^\d+$/.test(w)) {
      keywords.push(w);
    }
  });
  
  const fallback = [...new Set(keywords)].slice(0, 5);
  console.log(`[Keywords] Fallback extraction from "${question.substring(0, 60)}":`, fallback);
  return fallback.length > 0 ? fallback : ['placeholder'];
}

/**
 * Find INTERESTING causal markets - NOT obvious ones
 * Uses RANDOM sampling so different triggers see different markets
 */
export async function findInterestingCausalMarkets(
  triggerMarket: PolymarketMarket,
  outcome: string,
  allAvailableMarkets: PolymarketMarket[]
): Promise<Array<{ marketId: string; reasoning: string; timelag: string; strength: number; impactDirection: string }>> {
  console.log(`[findInterestingCausalMarkets] Finding cross-category impacts for: ${triggerMarket.question} → ${outcome}`);
  console.log(`[findInterestingCausalMarkets] Total markets available: ${allAvailableMarkets.length}`);
  
  // Filter low-volume only
  const majorMarkets = allAvailableMarkets.filter(m => m.volume >= 100000);
  
  console.log(`[findInterestingCausalMarkets] Filtered to ${majorMarkets.length} markets with volume >=$100k`);
  
  // Extract MEANINGFUL keywords from trigger using LLM
  const meaningfulKeywords = await extractMeaningfulKeywords(triggerMarket.question);
  console.log(`[findInterestingCausalMarkets] Using keywords for matching:`, meaningfulKeywords);
  
  const relatedMarkets = majorMarkets.filter(m => {
    const mq = m.question.toLowerCase();
    const mc = (m.category || '').toLowerCase();
    
    // WHOLE-WORD matching only (not substring)
    return meaningfulKeywords.some(kw => {
      const kwLower = kw.toLowerCase();
      // Use word boundaries to avoid matching "ai" in "Ukraine"
      const regex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(m.question) || regex.test(m.category || '');
    });
  }).sort((a, b) => b.volume - a.volume);
  
  // ONLY use related markets - with fallback if none found
  let sampledMarkets = relatedMarkets.slice(0, 100);
  
  // FALLBACK: If no related markets found, use top 100 by volume
  if (sampledMarkets.length === 0) {
    console.log(`[findInterestingCausalMarkets] WARNING: No related markets found! Using top 100 by volume as fallback`);
    sampledMarkets = majorMarkets.sort((a, b) => b.volume - a.volume).slice(0, 100);
  }
  
  console.log(`[findInterestingCausalMarkets] Found ${relatedMarkets.length} related markets, using top ${sampledMarkets.length} by volume`);
  console.log(`[findInterestingCausalMarkets] Sample includes:`);
  sampledMarkets.slice(0, 10).forEach((m, i) => {
    console.log(`  ${i + 1}. [${m.category}] ${m.question.substring(0, 60)}`);
  });
  
  if (sampledMarkets.length === 0) {
    console.error(`[findInterestingCausalMarkets] FATAL: No markets to analyze!`);
    return [];
  }

  const prompt = `You are a rigorous economist analyzing causal relationships in prediction markets.

TRIGGER EVENT: "${triggerMarket.question}" resolves to "${outcome}"

Task: Identify 3-5 markets that would be MOST CAUSALLY AFFECTED by this trigger event.

EVALUATION CRITERIA:

1. CAUSAL MECHANISM (Required)
   - There must be a clear, direct mechanism by which the trigger causes the effect
   - Ask: "If A happens, WHY would B happen?" If you can't give a specific mechanism, reject it
   - Economic/financial transmission paths are strongest
   - Policy changes, market reactions, and geopolitical shifts are valid
   - Avoid speculation, sentiment, or weak indirect connections

2. MAGNITUDE (Filter)
   - The trigger must be significant enough to materially affect the target market
   - Minor influences or tertiary effects should be excluded
   - Focus on first-order and strong second-order effects only

3. CROSS-CATEGORY PRIORITY
   - Prioritize relationships that cross different domains
   - Economic → Political, Political → Financial, Financial → International, etc.

4. EXCLUSION RULES
   - Do NOT include markets that are just incremental versions of the same thing
   - Do NOT include markets with only tenuous, multi-step reasoning
   - Do NOT include markets based solely on sentiment or public perception

AVAILABLE MARKETS (use EXACT IDs):
${sampledMarkets.map((m, i) => `${i + 1}. ID="${m.id}" ${m.question}`).join("\n")}

OUTPUT FORMAT (JSON):
{
  "causally_affected": [
    {
      "marketId": "EXACT_ID_FROM_LIST_ABOVE",
      "reasoning": "Concise explanation of the specific causal mechanism",
      "timelag": "immediate|hours|days|weeks",
      "impactDirection": "increase|decrease",
      "strength": 0.0-1.0 (based on directness and certainty of causation)
    }
  ]
}

IMPORTANT: 
- Use EXACT market IDs from the list above
- Return 3-5 markets maximum
- Quality over quantity - only include relationships you can rigorously defend
- If unsure, exclude it`;

  try {
    const groq = getGroqClient();
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: "You are an expert economist and political analyst who identifies non-obvious causal relationships across different domains.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.error("[findInterestingCausalMarkets] ERROR: No content in LLM response");
      return [];
    }
    
    console.log("[findInterestingCausalMarkets] Raw LLM response:");
    console.log(content);
    
    const result = JSON.parse(content);
    const relationships = result.causally_affected || result.relationships || [];
    
    if (!Array.isArray(relationships) || relationships.length === 0) {
      console.error("[findInterestingCausalMarkets] ERROR: LLM returned no relationships");
      console.log("Full result object:", result);
      return [];
    }
    
    console.log(`[findInterestingCausalMarkets] SUCCESS: Found ${relationships.length} interesting causal relationships`);
    relationships.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.marketId}: ${r.reasoning} (strength: ${r.strength})`);
    });
    
    return relationships;
  } catch (error) {
    console.error("[findInterestingCausalMarkets] FATAL ERROR:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return [];
  }
}

