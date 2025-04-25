import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatRippleModule } from '@angular/material/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ThinkingBubbleComponent } from '../shared/components/thinking-bubble/thinking-bubble.component';

interface ChatMessage {
  content: string;
  isUser: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatDividerModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatRippleModule,
    ThinkingBubbleComponent
  ],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // 2 seconds
  private reconnectTimeoutId: any;
  isAuthenticated$: Observable<boolean>;
  isDarkTheme = false;
  messageInput = new FormControl('');
  savedDestinations: string[] = ['Paris', 'Tokyo', 'New York'];
  recentChats: string[] = ['Summer Vacation', 'Weekend Getaway', 'Business Trip'];
  messages: ChatMessage[] = [];
  isConnected = false;
  isThinking = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.isAuthenticated$ = this.authService.isAuthenticated$;
    this.loadThemePreference();
  }

  ngOnInit(): void {
    this.connectWebSocket();
    const greeting = "👋 Hello! I'm your travel assistant. I can help you plan your perfect trip, suggest destinations, find accommodations, or answer any travel-related questions. How can I assist you today?";
    this.addMessage(greeting, false);
  }

  ngOnDestroy(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }
    this.closeWebSocket();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private connectWebSocket(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      this.socket = new WebSocket('wss://p61j4q70xi.execute-api.us-east-1.amazonaws.com/production/');

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      };

      this.socket.onmessage = (event) => {
        this.isThinking = false;
        try {
          const data = JSON.parse(event.data);
          if (data.response) {
            this.addMessage(data.response, false);
          } else {
            this.addMessage(event.data, false);
          }
        } catch {
          this.addMessage(event.data, false);
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket closed');
        this.isConnected = false;
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
        this.socket?.close();
      };

    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.isConnected = false;
      this.attemptReconnect();
    }
  }

  private closeWebSocket(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`);

      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
      }

      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectAttempts++;
        this.connectWebSocket();
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
      this.addMessage('Connection lost. Please refresh the page.', false);
    }
  }

  private addMessage(content: string, isUser: boolean): void {
    this.messages.push({
      content,
      isUser,
      timestamp: new Date()
    });
  }

  private scrollToBottom(): void {
    try {
      this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
    } catch(err) { }
  }

  loadThemePreference(): void {
    const savedTheme = localStorage.getItem('theme');
    this.isDarkTheme = savedTheme === 'dark';
    this.applyTheme();
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('theme', this.isDarkTheme ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme(): void {
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
    const overlayContainer = document.querySelector('.cdk-overlay-container');
    if (overlayContainer) {
      overlayContainer.classList.toggle('dark-theme', this.isDarkTheme);
    }
  }

  async sendMessage(): Promise<void> {
    const message = this.messageInput.value?.trim();
    if (!message) return;

    try {
      if (!this.isConnected || this.socket?.readyState !== WebSocket.OPEN) {
        await this.ensureConnection();
      }

      if (this.socket?.readyState === WebSocket.OPEN) {
        this.addMessage(message, true);
        this.isThinking = true;

        this.socket.send(message);
        this.messageInput.reset();
      } else {
        throw new Error('WebSocket is not connected');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.addMessage('Failed to send message. Reconnecting...', false);
      this.connectWebSocket();
    }
  }

  private async ensureConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.connectWebSocket();

      let connectionAttempts = 0;
      const maxAttempts = 3;
      const checkInterval = setInterval(() => {
        connectionAttempts++;

        if (this.socket?.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval);
          resolve();
        } else if (connectionAttempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error('Failed to establish connection'));
        }
      }, 1000);
    });
  }

  async startNewChat(): Promise<void> {
    this.messages = [];
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }
    const greeting = "👋 Hello! I'm your travel assistant. I can help you plan your perfect trip, suggest destinations, find accommodations, or answer any travel-related questions. How can I assist you today?";
    this.addMessage(greeting, false);
  }

  loadChat(chat: string): void {
    // TODO: Implement loading previous chat
    console.log('Loading chat:', chat);
  }

  logout(): void {
    this.closeWebSocket();
    this.authService.signOut()
      .then(() => {
        this.router.navigate(['/auth']);
      })
      .catch(error => {
        console.error('Logout error:', error);
      });
  }
}
