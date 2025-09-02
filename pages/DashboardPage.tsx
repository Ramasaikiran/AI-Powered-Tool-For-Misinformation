import React, { useState, useCallback, useRef, useEffect } from 'react';
import DashboardCard from '../components/DashboardCard';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import { ICONS } from '../constants';
import { analyzeImageForAI, analyzeArticleContent, generateAwarenessTemplateText, getTrendingTopics, understandVoiceCommand, summarizeResultForSpeech, getChatbotResponse } from '../services/geminiService';
import type { ImageDetectionResult, ArticleAnalysisResult, UserHistoryItem } from '../types';

// Helper to convert file to base64
const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
});

const DashboardPage: React.FC = () => {
    // Shared State
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
    const [modalInfo, setModalInfo] = useState<{ isOpen: boolean; title: string; content: React.ReactNode }>({ isOpen: false, title: '', content: null });
    const { showToast } = useToast();

    // Voice Assistant State
    const [isListening, setIsListening] = useState(false);
    const [assistantMessages, setAssistantMessages] = useState<{ sender: 'user' | 'bot', text: string }[]>([
        { sender: 'bot', text: 'Hi! How can I help? Press the mic to talk to me.' }
    ]);
    const recognitionRef = useRef<any>(null);
    const assistantMessagesEndRef = useRef<HTMLDivElement>(null);


    // Image Detection State
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageResult, setImageResult] = useState<ImageDetectionResult | null>(null);

    // Article Detection State
    const [articleInput, setArticleInput] = useState('');
    const [articleResult, setArticleResult] = useState<ArticleAnalysisResult | null>(null);

    // Awareness Templates State
    const [templatePrompt, setTemplatePrompt] = useState('');
    const [templateContent, setTemplateContent] = useState<{ title: string; highlights: string[]; tips: string[] } | null>(null);
    const infographicRef = useRef<HTMLDivElement>(null);
    
    // Trending Searches State
    const [trendingTopics, setTrendingTopics] = useState<{ topic: string; risk: string; score: number }[]>([]);

    // User Insights State
    const [userHistory, setUserHistory] = useState<UserHistoryItem[]>(() => {
        try {
            const savedHistory = localStorage.getItem('codeHustlersHistory');
            return savedHistory ? JSON.parse(savedHistory) : [];
        } catch (error) {
            console.error("Failed to parse history from localStorage", error);
            return [];
        }
    });
    const truthBadgeEarned = userHistory.length >= 5;

    const handleLoading = (key: string, value: boolean) => setIsLoading(prev => ({...prev, [key]: value}));
    
    // Auto-scroll for assistant messages
    useEffect(() => {
        assistantMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [assistantMessages]);

    // Fetch trending topics on mount
    useEffect(() => {
        const fetchTopics = async () => {
            handleLoading('trending', true);
            try {
                const topics = await getTrendingTopics();
                setTrendingTopics(topics);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                showToast(message, 'error');
                setTrendingTopics([]); // Clear topics on error
            } finally {
                handleLoading('trending', false);
            }
        };
        fetchTopics();
    }, [showToast]);

    // Save history to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem('codeHustlersHistory', JSON.stringify(userHistory));
        } catch (error) {
            console.error("Failed to save history to localStorage", error);
        }
    }, [userHistory]);

    const addAssistantMessage = (sender: 'user' | 'bot', text: string, speak: boolean = false) => {
        setAssistantMessages(prev => [...prev, { sender, text }]);
        if (sender === 'bot' && speak) {
          const utterance = new SpeechSynthesisUtterance(text);
          speechSynthesis.speak(utterance);
        }
    };

    // Initialize Speech Recognition
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            const recognition = recognitionRef.current;
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => setIsListening(true);
            recognition.onresult = (event: any) => {
                const speechResult = event.results[0][0].transcript;
                processVoiceCommand(speechResult);
            };
            recognition.onspeechend = () => recognition.stop();
            recognition.onend = () => setIsListening(false);
            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
                let errorMessage = 'Sorry, I had trouble with speech recognition. Please try again.';
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    errorMessage = "Microphone access is required. Please check your browser's site settings.";
                    const modalContent = (
                        <div>
                            <p className="mb-4">CodeHustlers needs access to your microphone for the voice assistant.</p>
                            <p>To fix this, please go to your browser's site settings for this page and change the microphone permission from 'Block' to 'Allow'.</p>
                            <p className="mt-2 text-sm text-black/70 dark:text-white/70">You may need to reload the page after changing the setting.</p>
                        </div>
                    );
                    setModalInfo({ isOpen: true, title: 'Microphone Access Denied', content: modalContent });
                } else if (event.error === 'no-speech') {
                    errorMessage = "I didn't hear anything. Please try speaking again.";
                }
                addAssistantMessage('bot', errorMessage, true);
            };
        }
    }, []);

    const toggleListening = async () => {
        if (!recognitionRef.current) {
            addAssistantMessage('bot', 'Sorry, speech recognition is not supported on your browser.', true);
            return;
        }

        // Proactively check for permissions using the Permissions API.
        if (navigator.permissions) {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                if (permissionStatus.state === 'denied') {
                    const modalContent = (
                        <div>
                            <p className="mb-4">CodeHustlers needs access to your microphone for the voice assistant.</p>
                            <p>To fix this, please go to your browser's site settings for this page and change the microphone permission from 'Block' to 'Allow'.</p>
                            <p className="mt-2 text-sm text-black/70 dark:text-white/70">You may need to reload the page after changing the setting.</p>
                        </div>
                    );
                    setModalInfo({ isOpen: true, title: 'Microphone Access Denied', content: modalContent });
                    addAssistantMessage('bot', 'Microphone access is denied. Please enable it in your browser settings.', true);
                    return;
                }
            } catch (error) {
                console.error("Could not query microphone permission:", error);
                // If query fails, proceed and let the browser's default behavior handle it.
            }
        }
        
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    const processVoiceCommand = async (command: string) => {
        addAssistantMessage('user', command);
        handleLoading('voice', true);
    
        const context = {
            hasImage: !!imageFile,
            hasArticle: !!articleInput.trim(),
        };

        try {
            const result = await understandVoiceCommand(command, context);
            addAssistantMessage('bot', result.responseText, true);
        
            switch (result.intent) {
                case 'analyze_image':
                    if (context.hasImage) {
                        await handleImageDetect(true);
                    } else {
                        addAssistantMessage('bot', 'Please upload an image first, then ask me to analyze it.', true);
                    }
                    break;
                case 'analyze_article':
                     if (result.parameters?.article) {
                        setArticleInput(result.parameters.article);
                        await handleArticleDetect(true, result.parameters.article);
                    } else if (context.hasArticle) {
                        await handleArticleDetect(true);
                    } else {
                        addAssistantMessage('bot', 'Please provide an article URL or text for me to analyze.', true);
                    }
                    break;
                case 'get_trending_topics':
                    const topics = await getTrendingTopics();
                    const topicsText = topics.map(t => t.topic).join(', ');
                    addAssistantMessage('bot', `The current trending topics are: ${topicsText}`, true);
                    setTrendingTopics(topics);
                    break;
                case 'general_question':
                    const answer = await getChatbotResponse(command);
                    addAssistantMessage('bot', answer, true);
                    break;
            }
        } catch (error) {
             const message = error instanceof Error ? error.message : 'An unknown error occurred.';
             showToast(message, 'error');
             addAssistantMessage('bot', "I'm having trouble processing that request right now.", true);
        } finally {
            handleLoading('voice', false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
            setImageResult(null);
        }
    };
    
    const resetImageAnalysis = () => {
        setImageFile(null);
        setImagePreview(null);
        setImageResult(null);
    }

    const handleImageDetect = async (fromVoice: boolean = false) => {
        if (!imageFile) return;
        handleLoading('image', true);
        setImageResult(null);
        try {
            const base64Image = await toBase64(imageFile);
            const result = await analyzeImageForAI(base64Image, imageFile.type);
            setImageResult(result);
            updateHistory('image', imageFile.name, result.classification);
             if (fromVoice) {
                const summary = await summarizeResultForSpeech('image', result);
                addAssistantMessage('bot', summary, true);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unknown error occurred.';
            showToast(message, 'error');
             if (fromVoice) {
                addAssistantMessage('bot', 'Sorry, I encountered an error while analyzing the image.', true);
            }
        } finally {
            handleLoading('image', false);
        }
    };
    
    const handleArticleDetect = async (fromVoice: boolean = false, contentOverride?: string) => {
        const content = contentOverride || articleInput;
        const trimmedInput = content.trim();
        if (!trimmedInput) return;

        const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
        if ((trimmedInput.startsWith('http') || trimmedInput.startsWith('www.')) && !urlRegex.test(trimmedInput)) {
            setModalInfo({ isOpen: true, title: 'Invalid URL', content: 'Please provide a valid URL or paste article text.' });
            return;
        }
        
        handleLoading('article', true);
        setArticleResult(null);
        try {
            const result = await analyzeArticleContent(trimmedInput);
            setArticleResult(result);
            updateHistory('article', trimmedInput.substring(0, 30) + '...', `Risk: ${result.riskLevel}`);
             if (fromVoice) {
                const summary = await summarizeResultForSpeech('article', result);
                addAssistantMessage('bot', summary, true);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unknown error occurred.';
            showToast(message, 'error');
            if (fromVoice) {
                addAssistantMessage('bot', 'Sorry, I encountered an error while analyzing the article.', true);
            }
        } finally {
            handleLoading('article', false);
        }
    };

    const handleTemplateGenerate = async () => {
        if (!templatePrompt) return;
        handleLoading('template', true);
        setTemplateContent(null);
        try {
            const result = await generateAwarenessTemplateText(templatePrompt);
            setTemplateContent(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unknown error occurred.';
            showToast(message, 'error');
        } finally {
            handleLoading('template', false);
        }
    };
    
    const updateHistory = (type: 'image' | 'article', query: string, result: string) => {
        const newItem: UserHistoryItem = {
            id: Date.now().toString(),
            type,
            query,
            result,
            timestamp: new Date().toLocaleString()
        };
        setUserHistory(prev => [newItem, ...prev].slice(0, 10));
    };

    const handleDownloadInfographic = () => {
        const node = infographicRef.current;
        if (!node || !templateContent) return;
    
        // --- Configuration ---
        const scaleFactor = 2; // For higher resolution output
        const padding = 20;
        const { width } = node.getBoundingClientRect();
        const contentWidth = width - padding * 2;
        const fonts = {
            title: 'bold 20px sans-serif',
            highlight: '14px sans-serif',
            tip: 'italic 12px sans-serif',
        };
        const lineHeights = { title: 25, highlight: 20, tip: 18 };
        const margins = { afterTitle: 15, afterHighlights: 10 };
        
        // Determine colors based on theme for the export
        const isDarkMode = document.documentElement.classList.contains('dark');
        const colors = {
            background: isDarkMode ? '#000000' : '#ffffff',
            title: '#4f46e5',      // indigo-600
            highlight: isDarkMode ? '#ffffff' : '#000000',
            tip: isDarkMode ? '#ffffffaa' : '#000000aa',
        };
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
    
        // --- Helper to measure height of wrapped text ---
        const measureTextHeight = (text: string, font: string, lineHeight: number): number => {
            ctx.font = font;
            const words = text.split(' ');
            let line = '';
            let y = lineHeight; // Start with one line's height
            for (const word of words) {
                const testLine = line + word + ' ';
                if (ctx.measureText(testLine).width > contentWidth && line.length > 0) {
                    y += lineHeight;
                    line = word + ' ';
                } else {
                    line = testLine;
                }
            }
            return y;
        };
    
        // --- 1. Calculate total height required ---
        let totalHeight = padding;
        totalHeight += measureTextHeight(templateContent.title, fonts.title, lineHeights.title);
        totalHeight += margins.afterTitle;
        templateContent.highlights.forEach(h => {
            totalHeight += measureTextHeight(`• ${h}`, fonts.highlight, lineHeights.highlight);
        });
        totalHeight += margins.afterHighlights;
        templateContent.tips.forEach(t => {
            totalHeight += measureTextHeight(t, fonts.tip, lineHeights.tip);
        });
        totalHeight += padding;
        
        // --- 2. Set final canvas dimensions and styles ---
        canvas.width = width * scaleFactor;
        canvas.height = totalHeight * scaleFactor;
        
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.scale(scaleFactor, scaleFactor);
        ctx.textBaseline = 'top'; // Crucial for accurate Y positioning
    
        // --- Helper to draw wrapped text ---
        const drawWrappedText = (text: string, x: number, y: number, font: string, lineHeight: number, color: string): number => {
            ctx.font = font;
            ctx.fillStyle = color;
            const words = text.split(' ');
            let line = '';
            let currentY = y;
            for (const word of words) {
                const testLine = line + word + ' ';
                if (ctx.measureText(testLine).width > contentWidth && line.length > 0) {
                    ctx.fillText(line.trim(), x, currentY);
                    currentY += lineHeight;
                    line = word + ' ';
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line.trim(), x, currentY);
            return currentY + lineHeight; // Return Y position for the *next* element
        };
    
        // --- 3. Perform drawing ---
        let currentY = padding;
        currentY = drawWrappedText(templateContent.title, padding, currentY, fonts.title, lineHeights.title, colors.title);
        currentY += margins.afterTitle;
        templateContent.highlights.forEach(h => {
            currentY = drawWrappedText(`• ${h}`, padding, currentY, fonts.highlight, lineHeights.highlight, colors.highlight);
        });
        currentY += margins.afterHighlights;
        templateContent.tips.forEach(t => {
            currentY = drawWrappedText(t, padding, currentY, fonts.tip, lineHeights.tip, colors.tip);
        });
    
        // --- 4. Trigger Download ---
        const link = document.createElement('a');
        link.download = 'CodeHustlers-Awareness-Card.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const getShareText = () => {
        if (!templateContent) return '';
        const { title, highlights, tips } = templateContent;
        const highlightsText = highlights.map(h => `• ${h}`).join('\n');
        const tipsText = tips.join('\n');
        return `${title}\n\n${highlightsText}\n\n${tipsText}`;
    };
    
    return (
        <div className="animate-fade-in-up">
            <h1 className="text-3xl font-bold mb-8 text-center text-black dark:text-white">AI Detection Suite</h1>
            <p className="text-center text-black/70 dark:text-white/70 mb-12 max-w-2xl mx-auto">Professional-grade tools for comprehensive misinformation detection and analysis.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Voice Assistant */}
                <DashboardCard title="Voice Assistant" icon={ICONS.mic}>
                     <div className="h-48 flex flex-col space-y-2 overflow-y-auto p-2 bg-black/5 dark:bg-white/5 rounded-md mb-4 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600">
                        {assistantMessages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`px-3 py-1.5 rounded-lg max-w-xs ${msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-black/10 text-black dark:bg-white/10 dark:text-white'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        <div ref={assistantMessagesEndRef} />
                    </div>
                    <button
                        onClick={toggleListening}
                        disabled={isLoading['voice']}
                        className={`w-full flex items-center justify-center p-2 rounded-md transition-colors text-white font-bold ${isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:bg-gray-400`}
                    >
                        {isLoading['voice'] ? (
                            <span className="animate-pulse">Processing...</span>
                        ) : isListening ? (
                            'Stop Listening'
                        ) : (
                            'Start Listening'
                        )}
                    </button>
                </DashboardCard>

                {/* AI Image Detection */}
                <DashboardCard title="AI Image Detection" icon={ICONS.image}>
                    {!imagePreview && (
                        <div className="text-center">
                            <input type="file" id="image-upload" className="hidden" accept="image/*" onChange={handleImageChange} />
                            <label htmlFor="image-upload" className="cursor-pointer bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold py-2 px-4 rounded-lg inline-block hover:bg-indigo-200 dark:hover:bg-indigo-800/50">
                                Upload Image
                            </label>
                            <p className="text-xs text-black/50 dark:text-white/50 mt-2">Upload an image to check for signs of AI generation.</p>
                        </div>
                    )}
                    {imagePreview && (
                        <div>
                            <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg mb-4" />
                            <div className="flex space-x-2">
                                <button onClick={() => handleImageDetect()} disabled={isLoading['image']} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                                    {isLoading['image'] ? <span className="animate-pulse">Analyzing...</span> : 'Analyze'}
                                </button>
                                <button onClick={resetImageAnalysis} className="bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-black dark:text-white font-bold py-2 px-4 rounded-lg">
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}
                    {imageResult && (
                        <div className="mt-4 p-3 bg-black/5 dark:bg-white/5 rounded-lg animate-fade-in-down">
                            <p><strong>Classification:</strong> <span className={`font-bold ${imageResult.classification === 'AI-generated' ? 'text-red-500' : 'text-green-500'}`}>{imageResult.classification}</span></p>
                            <p><strong>Confidence:</strong> {imageResult.confidence}%</p>
                            <p className="text-sm mt-1"><strong>Explanation:</strong> {imageResult.explanation}</p>
                        </div>
                    )}
                </DashboardCard>

                {/* Article Misinformation */}
                <DashboardCard title="Article Misinformation" icon={ICONS.article}>
                    <textarea
                        value={articleInput}
                        onChange={(e) => setArticleInput(e.target.value)}
                        placeholder="Paste article text or URL here..."
                        className="w-full h-32 p-2 bg-transparent rounded-md mb-4 border border-black/20 dark:border-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    ></textarea>
                    <button onClick={() => handleArticleDetect()} disabled={isLoading['article']} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                        {isLoading['article'] ? <span className="animate-pulse">Analyzing...</span> : 'Analyze'}
                    </button>
                    {articleResult && (
                        <div className="mt-4 p-3 bg-black/5 dark:bg-white/5 rounded-lg animate-fade-in-down">
                             <div className="flex justify-between items-baseline">
                                <p><strong>Risk Level:</strong> <span className="font-bold">{articleResult.riskLevel}</span></p>
                                <p><strong>Credibility:</strong> {articleResult.credibilityScore}%</p>
                            </div>
                            <div className="mt-2">
                                <h4 className="font-bold">Summary:</h4>
                                <p className="text-sm">{articleResult.summary}</p>
                            </div>
                        </div>
                    )}
                </DashboardCard>

                {/* Awareness Templates */}
                <DashboardCard title="Awareness Templates" icon={ICONS.template}>
                    <input
                        type="text"
                        value={templatePrompt}
                        onChange={(e) => setTemplatePrompt(e.target.value)}
                        placeholder="Enter a topic (e.g., 'fake moon landing')"
                        className="w-full p-2 bg-transparent rounded-md mb-4 border border-black/20 dark:border-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button onClick={handleTemplateGenerate} disabled={isLoading['template']} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                        {isLoading['template'] ? <span className="animate-pulse">Generating...</span> : 'Generate'}
                    </button>
                    {templateContent && (
                        <div className="mt-4 p-3 bg-black/5 dark:bg-white/5 rounded-lg animate-fade-in-down" ref={infographicRef}>
                            <h4 className="text-lg font-bold text-indigo-600">{templateContent.title}</h4>
                            <ul className="list-disc list-inside my-2 text-sm space-y-1">
                                {templateContent.highlights.map((h, i) => <li key={i}>{h}</li>)}
                            </ul>
                            <p className="text-xs italic">{templateContent.tips.join(' ')}</p>
                            <div className="flex space-x-2 mt-4">
                                <button onClick={handleDownloadInfographic} className="flex-1 text-sm bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg">Download</button>
                                <button onClick={() => { navigator.clipboard.writeText(getShareText()); showToast('Copied to clipboard!', 'success'); }} className="flex-1 text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg">Copy Text</button>
                            </div>
                        </div>
                    )}
                </DashboardCard>

                {/* Trending Searches */}
                <DashboardCard title="Trending Misinformation" icon={ICONS.trending}>
                    {isLoading['trending'] ? (
                         <div className="space-y-3 animate-pulse">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="border-b border-black/10 dark:border-white/10 pb-2 last:border-b-0">
                                    <div className="h-4 bg-black/20 dark:bg-white/20 rounded w-3/4 mb-2"></div>
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="h-3 bg-black/20 dark:bg-white/20 rounded w-1/4"></div>
                                        <div className="h-3 bg-black/20 dark:bg-white/20 rounded w-1/4"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : trendingTopics.length > 0 ? (
                        <ul className="space-y-3">
                            {trendingTopics.map((item, index) => (
                                <li key={index} className="border-b border-black/10 dark:border-white/10 pb-2 last:border-b-0">
                                    <p className="font-semibold">{item.topic}</p>
                                    <div className="flex justify-between items-center text-sm text-black/60 dark:text-white/60">
                                        <span>Risk: {item.risk}</span>
                                        <span>Credibility: {item.score}%</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Could not load trending topics.</p>
                    )}
                </DashboardCard>

                {/* User Insights */}
                <DashboardCard title="User Insights" icon={ICONS.insights}>
                    <div className="text-center mb-4">
                        {truthBadgeEarned ? (
                             <span className="inline-block bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">Truth Seeker Badge Earned!</span>
                        ) : (
                            <p className="text-sm text-black/70 dark:text-white/70">Complete {5 - userHistory.length} more analyses to earn the "Truth Seeker" badge.</p>
                        )}
                    </div>
                    <h4 className="font-bold mb-2">Recent Activity:</h4>
                    {userHistory.length > 0 ? (
                        <ul className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600">
                            {userHistory.map(item => (
                                <li key={item.id} className="text-sm p-2 bg-black/5 dark:bg-white/5 rounded-md">
                                    <p className="truncate"><strong>{item.type === 'image' ? 'Image' : 'Article'}:</strong> {item.query}</p>
                                    <p className="text-xs text-black/60 dark:text-white/60">{item.timestamp}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-black/70 dark:text-white/70">No recent activity.</p>
                    )}
                </DashboardCard>
            </div>

            <Modal isOpen={modalInfo.isOpen} onClose={() => setModalInfo({ ...modalInfo, isOpen: false })} title={modalInfo.title}>
                {modalInfo.content}
            </Modal>
        </div>
    );
};

export default DashboardPage;