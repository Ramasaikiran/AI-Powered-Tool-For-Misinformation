


import { GoogleGenAI, GenerateContentResponse, Type, Chat } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Initialize a chat session for the chatbot
const chat: Chat = ai.chats.create({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: 'You are a friendly and helpful chatbot for the CodeHustlers website. Your purpose is to answer user questions about the features of the site and provide general information about any topic by searching the web when necessary. Keep your answers concise and easy to understand.',
    tools: [{ googleSearch: {} }],
  },
});

export const getChatbotResponse = async (message: string): Promise<string> => {
    try {
        const response = await chat.sendMessage({ message });
        return response.text;
    } catch (error) {
        console.error("Error with chatbot:", error);
        throw new Error("Failed to get a response from the chatbot. Please try again later.");
    }
};

export const analyzeImageForAI = async (base64Image: string, mimeType: string): Promise<any> => {
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
          {
            text: "Analyze this image for signs of AI generation. Focus on intrinsic features like texture inconsistencies, noise patterns, and known AI artifacts. Ignore lighting conditions like poor or low light. Provide a classification ('AI-generated', 'Authentic', or 'Uncertain'), a confidence score (0-100), and a brief explanation of your reasoning.",
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            classification: { type: Type.STRING },
            confidence: { type: Type.INTEGER },
            explanation: { type: Type.STRING }
          }
        }
      }
    });
    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw new Error('Failed to analyze image. Please check the image format and try again.');
  }
};

export const analyzeArticleContent = async (content: string): Promise<any> => {
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze the following article text. Break it down into key claims. Fact-check each claim against reliable sources. Provide an overall misinformation risk level ('Low', 'Medium', 'High'), a credibility score (0-100), a list of topic tags, a concise summary, and source attribution for your findings. Article content: "${content}"`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        riskLevel: { type: Type.STRING },
                        credibilityScore: { type: Type.INTEGER },
                        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                        summary: { type: Type.STRING },
                        claims: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    claim: { type: Type.STRING },
                                    verification: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error analyzing article:", error);
        throw new Error('Failed to analyze article. The content may be invalid or the service is down.');
    }
};

export const generateAwarenessTemplateText = async (prompt: string): Promise<any> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate content for an awareness infographic based on this topic: "${prompt}". Provide a catchy title, 3-4 key bullet points explaining why the content is misleading, and 1-2 safety tips or verified sources. Make it concise and easy to share.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                        tips: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error generating template text:", error);
        throw new Error('Failed to generate template. Please try a different topic.');
    }
};

export const getTrendingTopics = async (): Promise<{ topic: string; risk: string; score: number }[]> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "List the top 5 trending misinformation topics or narratives currently circulating online. For each topic, provide a short title, a risk level ('High', 'Medium', 'Low'), and a credibility score (0-100). Format each as: `Title - Risk: [level] - Credibility: [score]`",
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const text = response.text;
        if (!text) {
             throw new Error("Received an empty response for trending topics.");
        }

        const topics = text.split('\n').map(line => {
            const match = line.match(/(?:\d+\.\s*)?(.*?)\s*-\s*Risk:\s*(.*?)\s*-\s*Credibility:\s*(\d+)/);
            if (match) {
                return {
                    topic: match[1].trim().replace(/^"|"$/g, ''),
                    risk: match[2].trim(),
                    score: parseInt(match[3], 10),
                };
            }
            return null;
        }).filter((item): item is { topic: string; risk: string; score: number } => item !== null);
        
        if (topics.length > 0) return topics.slice(0, 5);

        // If parsing fails but text exists, it's a malformed response
        console.warn("Could not parse trending topics from response:", text);
        throw new Error("Could not parse trending topics from the service.");

    } catch (error) {
        console.error("Error fetching trending topics:", error);
        throw new Error('Failed to fetch trending topics. Please check your connection.');
    }
};

export const understandVoiceCommand = async (command: string, context: { hasImage: boolean; hasArticle: boolean }): Promise<any> => {
  const possibleIntents = [
    'analyze_image: User wants to analyze the uploaded image.',
    'analyze_article: User wants to analyze the provided article text or URL.',
    'get_trending_topics: User wants to know the current trending misinformation topics.',
    'generate_template: User wants to generate an awareness template for a topic.',
    'general_question: User is asking a general question.',
    'greet: User is saying hello or greeting the assistant.',
    'unknown: The user intent is unclear or not related to the app functions.'
  ];

  const prompt = `
    You are the voice assistant for CodeHustlers, an AI-powered misinformation detection tool.
    Your task is to understand the user's voice command and determine their intent and any relevant parameters.
    The user can perform the following actions: analyze an image, analyze an article, get trending topics, or generate an awareness template.

    Current context:
    - An image is ${context.hasImage ? 'currently uploaded and ready for analysis' : 'not uploaded'}.
    - An article text/URL is ${context.hasArticle ? 'currently entered and ready for analysis' : 'not entered'}.

    Based on the user's command: "${command}", identify the intent from the following list:
    ${possibleIntents.join('\n')}

    Also, extract any parameters (like a URL for an article, or a topic for a template). If the command is about an image or article that is already in context, you don't need to extract any parameter.

    Respond ONLY with a valid JSON object matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING },
            parameters: {
              type: Type.OBJECT,
              properties: {
                article: { type: Type.STRING, description: "URL or text of the article to analyze." },
                topic: { type: Type.STRING, description: "Topic for the awareness template." }
              }
            },
            responseText: { type: Type.STRING, description: "A friendly, conversational response to the user, acknowledging their command." }
          }
        }
      }
    });
    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error understanding voice command:", error);
    throw new Error("I couldn't understand that command. Could you please rephrase?");
  }
};


export const summarizeResultForSpeech = async (resultType: 'image' | 'article', result: any): Promise<string> => {
  let prompt = '';
  if (resultType === 'article') {
    prompt = `Concisely summarize this article analysis result for a voice assistant to speak. Be friendly and direct. Result: Risk Level is ${result.riskLevel}, Credibility Score is ${result.credibilityScore}. Summary: ${result.summary}`;
  } else if (resultType === 'image') {
    prompt = `Concisely summarize this image analysis result for a voice assistant to speak. Be friendly and direct. Result: The image is classified as ${result.classification} with ${result.confidence}% confidence. Explanation: ${result.explanation}`;
  } else {
    return "The analysis is complete."
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error summarizing result:", error);
    // Return a fallback summary instead of throwing an error to not break the voice flow
    return "I've completed the analysis for you.";
  }
}