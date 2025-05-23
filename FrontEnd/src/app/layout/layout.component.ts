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
    this.disconnectWebSocket();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private connectWebSocket(): void {
    this.socket = new WebSocket('wss://p61j4q70xi.execute-api.us-east-1.amazonaws.com/production/');

    this.socket.onopen = () => {
      this.isConnected = true;
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
      this.isConnected = false;
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
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
    if (message && this.socket?.readyState === WebSocket.OPEN) {
      this.addMessage(message, true);
      
      this.isThinking = true;
      
      try {
        this.socket.send(message);
        this.messageInput.reset();
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
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
    this.disconnectWebSocket();
    this.authService.signOut()
      .then(() => {
        this.router.navigate(['/auth']);
      })
      .catch(error => {
        console.error('Logout error:', error);
      });
  }
}
