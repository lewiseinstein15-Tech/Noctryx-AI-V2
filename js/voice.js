/**
 * Noctryx AI V2 - Voice Module
 * SpeechRecognition and SpeechSynthesis with wake word prep.
 */

import { $, speak } from './utils.js';
import { addMessage } from './memory.js';

let recognition = null;
let isListening = false;
let wakeMode = false;

export function initVoice() {
  const toggle = $('#voiceToggle');
  const status = $('#voiceStatus');
  const transcript = $('#voiceTranscript');
  const orb = $('#voiceOrb');
  
  // Setup recognition if available
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    if (status) status.textContent = 'Voice API unavailable in this browser';
    toggle?.classList.add('disabled');
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    isListening = true;
    toggle?.classList.add('active');
    if (status) {
      status.textContent = wakeMode ? 'Listening for wake word...' : 'Listening...';
      status.classList.add('listening');
    }
    if (orb) orb.style.animation = 'pulse 1s ease-in-out infinite';
  };
  
  recognition.onend = () => {
    isListening = false;
    toggle?.classList.remove('active');
    if (status) {
      status.classList.remove('listening');
      status.textContent = wakeMode ? 'Wake word active' : 'Tap microphone to start';
    }
    if (orb) orb.style.animation = '';
    
    // Auto-restart wake mode
    if (wakeMode) {
      setTimeout(() => {
        if (wakeMode && !isListening) {
          try { recognition.start(); } catch {}
        }
      }, 500);
    }
  };
  
  recognition.onresult = (e) => {
    let interim = '';
    let final = '';
    
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcriptText = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        final += transcriptText;
      } else {
        interim += transcriptText;
      }
    }
    
    if (transcript) transcript.textContent = interim || final;
    
    if (final) {
      handleVoiceInput(final.trim());
    }
  };
  
  recognition.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
    if (status) status.textContent = `Error: ${e.error}`;
  };
  
  toggle?.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
    } else {
      wakeMode = false;
      try { recognition.start(); } catch {}
    }
  });
  
  // Voice input from search bars
  $('#voiceInputBtn')?.addEventListener('click', () => {
    if (!isListening) {
      try { recognition.start(); } catch {}
    }
  });
  
  $('#chatVoiceBtn')?.addEventListener('click', () => {
    if (!isListening) {
      try { recognition.start(); } catch {}
    }
  });
  
  // Update listening bar on home
  updateListeningBar();
}

function handleVoiceInput(text) {
  const transcript = $('#voiceTranscript');
  
  // Wake word detection
  const lower = text.toLowerCase();
  if (lower.includes('hey noctryx') || lower.includes('ok noctryx')) {
    wakeMode = false;
    speak('Yes, I am listening.').catch(() => {});
    if (transcript) transcript.textContent = 'Wake word detected!';
    // Navigate to chat
    window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'chat' } }));
    return;
  }
  
  if (transcript) transcript.textContent = text;
  
  // If on chat screen, submit as message
  const chatScreen = $('#screen-chat');
  if (chatScreen?.classList.contains('active')) {
    const input = $('#chatInput');
    if (input) {
      input.value = text;
