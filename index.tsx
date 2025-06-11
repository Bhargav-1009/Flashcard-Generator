/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, GenerateContentResponse} from '@google/genai';

// --- Start of Speech Recognition API Type Definitions ---
interface SpeechRecognitionResult {
  isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
  readonly interpretation?: any; // Depending on browser, might exist
  readonly emma?: Document;      // Depending on browser, might exist
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string; // Typically a DOMExceptionString like 'not-allowed', 'no-speech', etc.
  readonly message: string; // Optional, browser-dependent message
}

interface SpeechRecognitionStatic {
  new (): SpeechRecognition;
}

interface SpeechRecognition extends EventTarget {
  grammars: any; // Actually SpeechGrammarList, but 'any' for simplicity if not used deeply
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  serviceURI?: string; // Deprecated in some browsers

  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;

  abort(): void;
  start(): void;
  stop(): void;
}

// Extend Window interface to include SpeechRecognition and webkitSpeechRecognition
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionStatic;
    webkitSpeechRecognition?: SpeechRecognitionStatic;
  }
}
// --- End of Speech Recognition API Type Definitions ---


interface Flashcard {
  term: string;
  definition: string;
}

interface EvaluationResponse {
  assessment: 'correct' | 'partially_correct' | 'incorrect';
  explanation: string;
}

const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;

// Voice Input Modal Elements
const voiceInputModal = document.getElementById('voiceInputModal') as HTMLDivElement;
const modalTerm = document.getElementById('modalTerm') as HTMLElement;
const recordButton = document.getElementById('recordButton') as HTMLButtonElement;
const stopRecordButton = document.getElementById('stopRecordButton') as HTMLButtonElement;
const voiceStatus = document.getElementById('voiceStatus') as HTMLParagraphElement;
const transcribedText = document.getElementById('transcribedText') as HTMLTextAreaElement;
const checkAnswerButton = document.getElementById('checkAnswerButton') as HTMLButtonElement;
const cancelVoiceInputButton = document.getElementById('cancelVoiceInputButton') as HTMLButtonElement;

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  errorMessage.textContent = 'API_KEY is not configured. Please set the environment variable.';
  generateButton.disabled = true;
  // Disable modal buttons if API key is missing
  if (recordButton) recordButton.disabled = true;
  if (checkAnswerButton) checkAnswerButton.disabled = true;
}
const ai = new GoogleGenAI({apiKey: API_KEY!});

let currentCardForVoiceInput: { cardDiv: HTMLDivElement, term: string, definition: string } | null = null;
let recognition: SpeechRecognition | null = null; // Updated type
let isRecording = false;
let finalTranscript = '';

// Speech Recognition Setup
// Check for browser support and initialize SpeechRecognition
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true; // Keep recognizing until explicitly stopped
  recognition.interimResults = true; // Get interim results as user speaks
  recognition.lang = 'en-US'; // Set language

  recognition.onstart = () => {
    isRecording = true;
    voiceStatus.textContent = 'Listening... Speak now.';
    voiceStatus.classList.add('recording');
    recordButton.style.display = 'none';
    stopRecordButton.style.display = 'inline-flex';
    transcribedText.value = '';
    finalTranscript = '';
    checkAnswerButton.disabled = true;
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => { // Updated type
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    transcribedText.value = finalTranscript + interimTranscript;
    if (finalTranscript.trim().length > 0) {
        checkAnswerButton.disabled = false;
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => { // Updated type
    console.error('Speech recognition error:', event.error);
    voiceStatus.textContent = `Error: ${event.error}. Please try again.`;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voiceStatus.textContent = "Microphone access denied. Please enable it in your browser settings.";
    } else if (event.error === 'no-speech') {
        voiceStatus.textContent = "No speech detected. Please try speaking louder.";
    }
    stopRecording();
  };

  recognition.onend = () => {
    if (isRecording) { // If it ended unexpectedly, try to restart unless explicitly stopped
        // This can happen if there's a long pause. We might not want to auto-restart.
        // For now, we'll treat onend as a stop.
        stopRecording(); // Ensure UI is reset if recognition stops prematurely
    }
  };
} else {
  voiceStatus.textContent = "Speech recognition is not supported by your browser.";
  if (recordButton) recordButton.disabled = true;
}


function startRecording() {
  if (!recognition || !API_KEY) {
    voiceStatus.textContent = API_KEY ? "Speech recognition not available." : "API Key not configured.";
    return;
  }
  if (isRecording) return;

  // Check for microphone permission explicitly
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(() => {
        finalTranscript = ''; // Reset transcript
        transcribedText.value = '';
        recognition!.start();
    })
    .catch(err => {
        console.error("Microphone access denied:", err);
        voiceStatus.textContent = "Microphone access is required. Please allow it and try again.";
        voiceStatus.classList.remove('recording');
        recordButton.style.display = 'inline-flex';
        stopRecordButton.style.display = 'none';
        isRecording = false;
    });
}

function stopRecording() {
  if (recognition && isRecording) {
    recognition.stop();
  }
  isRecording = false;
  voiceStatus.textContent = 'Recording stopped.';
  voiceStatus.classList.remove('recording');
  recordButton.style.display = 'inline-flex';
  stopRecordButton.style.display = 'none';
  checkAnswerButton.disabled = !finalTranscript.trim();
}


function openVoiceInputModal(cardDiv: HTMLDivElement, term: string, definition: string) {
  currentCardForVoiceInput = { cardDiv, term, definition };
  modalTerm.textContent = term;
  transcribedText.value = '';
  finalTranscript = '';
  voiceStatus.textContent = 'Click "Start Recording" to speak your answer.';
  checkAnswerButton.disabled = true;
  recordButton.style.display = 'inline-flex';
  stopRecordButton.style.display = 'none';
  voiceInputModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open'); // Optional: for preventing body scroll
  recordButton.focus(); // Focus on the record button
}

function closeVoiceInputModal() {
  if (isRecording) {
    stopRecording();
  }
  voiceInputModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  currentCardForVoiceInput = null;
}

recordButton.addEventListener('click', startRecording);
stopRecordButton.addEventListener('click', stopRecording);


cancelVoiceInputButton.addEventListener('click', () => {
  if (currentCardForVoiceInput) {
    const { cardDiv, term } = currentCardForVoiceInput;
    flipCard(cardDiv, term, "The user chose to skip voice input."); // Provide a generic reason
  }
  closeVoiceInputModal();
});

// PASTE THIS ENTIRE BLOCK, REPLACING THE OLD checkAnswerButton LISTENER

// PASTE THIS ENTIRE BLOCK, REPLACING THE OLD checkAnswerButton LISTENER

checkAnswerButton.addEventListener('click', async () => {
  if (!currentCardForVoiceInput || !API_KEY || !ai) return;
  const userAnswer = transcribedText.value.trim();
  if (!userAnswer) {
    voiceStatus.textContent = 'Please provide an answer first.';
    return;
  }

  const { cardDiv, term, definition } = currentCardForVoiceInput;
  
  voiceStatus.textContent = 'Evaluating your answer...';
  checkAnswerButton.disabled = true;
  checkAnswerButton.setAttribute('aria-busy', 'true');
  cancelVoiceInputButton.disabled = true;

  try {
    const prompt = `You are an AI assistant evaluating a user's understanding of a concept based on their spoken answer to a flashcard.
Flashcard Term: "${term}"
Correct Definition: "${definition}"
User's Spoken Answer: "${userAnswer}"
Analyze the user's spoken answer in relation to the correct definition.
Determine if the user's answer is:
1. "correct": The user's answer accurately and comprehensively covers the main points of the correct definition.
2. "partially_correct": The user's answer captures some aspects of the correct definition but misses key details or contains minor inaccuracies.
3. "incorrect": The user's answer is fundamentally different from the correct definition or demonstrates a significant misunderstanding.
Provide your evaluation in JSON format with two keys: "assessment" (string: "correct", "partially_correct", or "incorrect") and "explanation" (string: a brief explanation for your assessment, max 30 words).`;

    // **FIX 1: Use 'config', not 'generationConfig'**
    // **FIX 2 & 3: Get text directly from 'result.text', not 'result.response.text()'**
    const result: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash-latest',
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    });

    const responseText = result.text; // Access text directly

    if (responseText) {
        let evaluation: EvaluationResponse;
        try {
            evaluation = JSON.parse(responseText.trim());
        } catch (e) {
            console.error("Failed to parse JSON evaluation:", e, "Raw text:", responseText);
            evaluation = { assessment: "incorrect", explanation: "Couldn't parse evaluation. Raw: " + responseText.substring(0,100) };
        }
        displayFeedbackOnCard(cardDiv, evaluation);
        flipCard(cardDiv, term, evaluation.explanation, evaluation.assessment);
    } else {
        throw new Error("The AI response was empty or blocked.");
    }
  } catch (error) {
    console.error('Error evaluating answer:', error);
    let detailedError = 'An unknown error occurred during evaluation.';
     if (error instanceof Error) {
        detailedError = error.message;
    } else if (typeof error === 'string') {
        detailedError = error;
    }
    displayFeedbackOnCard(cardDiv, { assessment: 'incorrect', explanation: `Evaluation error: ${detailedError}` });
    flipCard(cardDiv, term, `Evaluation error: ${detailedError}`, 'incorrect');
  } finally {
    closeVoiceInputModal();
    checkAnswerButton.removeAttribute('aria-busy');
    cancelVoiceInputButton.disabled = false;
  }
});

function displayFeedbackOnCard(cardDiv: HTMLDivElement, evaluation: EvaluationResponse | null) {
    const cardBack = cardDiv.querySelector('.flashcard-back');
    if (!cardBack) return;

    let feedbackArea = cardBack.querySelector('.feedback-area') as HTMLDivElement;
    if (!feedbackArea) {
        feedbackArea = document.createElement('div');
        feedbackArea.classList.add('feedback-area');
        // Insert feedback before the definition or at the end of content-wrapper
        const contentWrapper = cardBack.querySelector('.flashcard-content-wrapper');
        if (contentWrapper) {
             contentWrapper.insertAdjacentElement('afterend', feedbackArea); // Place it after content for better flow
        } else {
            cardBack.appendChild(feedbackArea);
        }
    }
    
    if (evaluation) {
        feedbackArea.innerHTML = `<strong>${evaluation.assessment.replace('_', ' ').toUpperCase()}:</strong> ${evaluation.explanation}`;
        feedbackArea.className = 'feedback-area'; // Reset classes
        feedbackArea.classList.add(`feedback-${evaluation.assessment}`);
        feedbackArea.style.display = 'block';
    } else {
        feedbackArea.style.display = 'none';
        feedbackArea.textContent = '';
    }
}


function flipCard(cardDiv: HTMLDivElement, term: string, fullDefinitionOrFeedback: string, assessment?: string) {
    const cardFront = cardDiv.querySelector('.flashcard-front') as HTMLElement;
    const cardBack = cardDiv.querySelector('.flashcard-back') as HTMLElement;
    const isFlipped = cardDiv.classList.contains('flipped');

    if (!isFlipped) { // Flipping to back (definition/feedback side)
        cardDiv.classList.add('flipped');
        let ariaLabel = `Flashcard: ${term}. Definition: ${currentCardForVoiceInput?.definition || 'Unknown'}.`;
        if (assessment) {
            ariaLabel += ` Your answer was ${assessment.replace('_', ' ')}. Feedback: ${fullDefinitionOrFeedback}`;
        } else {
            ariaLabel += ` Feedback: ${fullDefinitionOrFeedback}`;
        }
        cardDiv.setAttribute('aria-label', ariaLabel);
        cardFront.setAttribute('aria-hidden', 'true');
        cardBack.setAttribute('aria-hidden', 'false');
    } else { // Flipping back to front (term side)
        cardDiv.classList.remove('flipped');
        cardDiv.setAttribute('aria-label', `Flashcard: ${term}. Click to provide your answer or see definition.`);
        cardFront.setAttribute('aria-hidden', 'false');
        cardBack.setAttribute('aria-hidden', 'true');
        displayFeedbackOnCard(cardDiv, null); // Clear feedback when flipping to front
    }
}


// PASTE THIS ENTIRE BLOCK, REPLACING THE OLD generateButton LISTENER

// PASTE THIS ENTIRE BLOCK, REPLACING THE OLD generateButton LISTENER

generateButton.addEventListener('click', async () => {
  if (!API_KEY || !ai) { 
    errorMessage.textContent = 'API_KEY is not configured. Flashcard generation is disabled.';
    return;
  }
  const topic = topicInput.value.trim();
  if (!topic) {
    errorMessage.textContent = 'Please enter a topic or some terms and definitions.';
    return;
  }
  
  closeVoiceInputModal();

  errorMessage.textContent = 'Generating flashcards...';
  flashcardsContainer.innerHTML = '';
  generateButton.disabled = true;
  generateButton.setAttribute('aria-busy', 'true');

  try {
    const prompt = `Generate a list of flashcards for the topic of "${topic}". Each flashcard should have a term and a concise definition. Format the output as a list of "Term: Definition" pairs, with each pair on a new line. Ensure terms and definitions are distinct and clearly separated by a single colon. Maximum 30 flashcards.
    Example output format:
    Mitochondria: The powerhouse of the cell.
    Ribosome: Site of protein synthesis.`;

    const result: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const responseText = result.text; // Access text directly

    if (responseText) {
      // **FIX 4 & 5: Add explicit types for 'line' and 'card'**
      const flashcards: Flashcard[] = responseText
        .split('\n')
        .map((line: string) => {
          const cleanedLine = line.replace(/^[\s*-]+/, '');
          const parts = cleanedLine.split(':');
          if (parts.length >= 2 && parts[0].trim()) {
            const term = parts[0].trim();
            const definition = parts.slice(1).join(':').trim();
            if (definition) {
              return {term, definition};
            }
          }
          return null;
        })
        .filter((card: Flashcard | null): card is Flashcard => card !== null);

      if (flashcards.length > 0) {
        errorMessage.textContent = '';
        flashcards.forEach((flashcard, index) => {
            const cardDiv = document.createElement('div');
            cardDiv.classList.add('flashcard');
            cardDiv.dataset['index'] = index.toString();
            cardDiv.setAttribute('role', 'button');
            cardDiv.setAttribute('tabindex', '0');
            cardDiv.setAttribute('aria-label', `Flashcard: ${flashcard.term}. Click to provide your answer or see definition.`);
            
            // ... the rest of the card creation code is correct ...
            const cardInner = document.createElement('div');
            cardInner.classList.add('flashcard-inner');

            const cardFront = document.createElement('div');
            cardFront.classList.add('flashcard-front');
            cardFront.setAttribute('aria-hidden', 'false');
            
            const frontContentWrapper = document.createElement('div');
            frontContentWrapper.classList.add('flashcard-content-wrapper');
            
            const termDiv = document.createElement('div');
            termDiv.classList.add('term');
            termDiv.textContent = flashcard.term;
            frontContentWrapper.appendChild(termDiv);
            cardFront.appendChild(frontContentWrapper);

            const cardBack = document.createElement('div');
            cardBack.classList.add('flashcard-back');
            cardBack.setAttribute('aria-hidden', 'true');

            const backContentWrapper = document.createElement('div');
            backContentWrapper.classList.add('flashcard-content-wrapper');

            const definitionDiv = document.createElement('div');
            definitionDiv.classList.add('definition');
            definitionDiv.textContent = flashcard.definition;
            backContentWrapper.appendChild(definitionDiv);
            cardBack.appendChild(backContentWrapper);
            
            const feedbackDiv = document.createElement('div');
            feedbackDiv.classList.add('feedback-area');
            feedbackDiv.style.display = 'none';
            cardBack.appendChild(feedbackDiv);
            
            cardInner.appendChild(cardFront);
            cardInner.appendChild(cardBack);
            cardDiv.appendChild(cardInner);

            flashcardsContainer.appendChild(cardDiv);

            cardDiv.addEventListener('click', () => {
              if (cardDiv.classList.contains('flipped')) {
                flipCard(cardDiv, flashcard.term, flashcard.definition);
              } else {
                openVoiceInputModal(cardDiv, flashcard.term, flashcard.definition);
              }
            });
            cardDiv.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (cardDiv.classList.contains('flipped')) {
                  flipCard(cardDiv, flashcard.term, flashcard.definition);
                } else {
                  openVoiceInputModal(cardDiv, flashcard.term, flashcard.definition);
                }
              }
            });
        });
      } else {
        errorMessage.textContent = 'No valid flashcards generated. Model returned an unexpected format.';
      }
    } else {
      errorMessage.textContent = 'Failed to generate flashcards: Empty response from model.';
    }
  } catch (error: unknown) {
    console.error('Error generating content:', error);
    let detailedError = 'An unknown error occurred.';
    if (error instanceof Error) {
        detailedError = error.message;
    } else if (typeof error === 'string') {
        detailedError = error;
    }
    errorMessage.textContent = `Error: ${detailedError}`;
  } finally {
    generateButton.disabled = false;
    generateButton.removeAttribute('aria-busy');
  }
});

// Close modal if escape key is pressed
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && voiceInputModal.getAttribute('aria-hidden') === 'false') {
        closeVoiceInputModal();
        if (currentCardForVoiceInput) { // If a card was active, flip it as if "cancel" was clicked
            const { cardDiv, term } = currentCardForVoiceInput;
            flipCard(cardDiv, term, "Voice input cancelled.");
        }
    }
});
