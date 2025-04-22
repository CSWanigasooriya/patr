import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  created: Date;
  lastUpdated: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private currentSession = new BehaviorSubject<ChatSession | null>(null);
  currentSession$ = this.currentSession.asObservable();

  constructor() {}

  async startNewChat(): Promise<ChatSession> {
    const session: ChatSession = {
      id: this.generateId(),
      title: 'New Trip Plan',
      messages: [],
      created: new Date(),
      lastUpdated: new Date()
    };
    this.currentSession.next(session);
    return session;
  }

  async sendMessage(content: string): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      id: this.generateId(),
      content,
      role: 'user',
      timestamp: new Date()
    };

    // Add user message to the current session
    this.addMessageToSession(userMessage);

    try {
      // TODO: Integrate with AWS Bedrock
      const aiResponse = await this.getAIResponse(content);
      
      const assistantMessage: ChatMessage = {
        id: this.generateId(),
        content: aiResponse,
        role: 'assistant',
        timestamp: new Date()
      };

      // Add AI response to the current session
      this.addMessageToSession(assistantMessage);
      return assistantMessage;
    } catch (error) {
      console.error('Error getting AI response:', error);
      throw error;
    }
  }

  private async getAIResponse(message: string): Promise<string> {
    // TODO: Implement actual AWS Bedrock API call
    // This is a placeholder that simulates an AI response
    await new Promise(resolve => setTimeout(resolve, 1000));
    return `Here's a travel recommendation based on your request: "${message}"...`;
  }

  private addMessageToSession(message: ChatMessage) {
    const currentSession = this.currentSession.value;
    if (currentSession) {
      currentSession.messages.push(message);
      currentSession.lastUpdated = new Date();
      this.currentSession.next(currentSession);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
} 