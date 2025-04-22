import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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
import { ChatService, ChatMessage as ServiceChatMessage } from '../services/chat.service';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

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
    MatRippleModule
  ],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  isAuthenticated$: Observable<boolean>;
  isDarkTheme = false;
  messageInput = new FormControl('');
  savedDestinations: string[] = ['Paris', 'Tokyo', 'New York'];
  recentChats: string[] = ['Summer Vacation', 'Weekend Getaway', 'Business Trip'];
  messages: ChatMessage[] = [];

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router
  ) {
    this.isAuthenticated$ = this.authService.isAuthenticated$;
    this.loadThemePreference();
    
    // Initialize with sample messages
    this.messages = [
      {
        content: "Hi! I'm your travel AI assistant. How can I help you plan your next adventure?",
        isUser: false,
        timestamp: new Date(Date.now() - 60000 * 5)
      },
      {
        content: "I'm looking for recommendations for a summer vacation in Europe",
        isUser: true,
        timestamp: new Date(Date.now() - 60000 * 4)
      },
      {
        content: "Great choice! Based on your interest in European summer destinations, I'd recommend considering:\n\n1. The French Riviera - Perfect for beaches and cultural experiences\n2. Greek Islands - Ideal for island hopping and Mediterranean cuisine\n3. Barcelona, Spain - Amazing architecture, beaches, and vibrant culture\n\nWould you like more specific details about any of these destinations?",
        isUser: false,
        timestamp: new Date(Date.now() - 60000 * 3)
      }
    ];
  }

  ngOnInit(): void {
    // Load user preferences and recent chats
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
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
    if (message) {
      // Add user message
      this.messages.push({
        content: message,
        isUser: true,
        timestamp: new Date()
      });

      try {
        // Send to chat service and get AI response
        const response = await this.chatService.sendMessage(message);
        this.messages.push({
          content: response.content,
          isUser: false,
          timestamp: new Date()
        });
        this.messageInput.reset();
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }

  async startNewChat(): Promise<void> {
    try {
      await this.chatService.startNewChat();
      this.messages = [];
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  }

  loadChat(chat: string): void {
    // TODO: Implement loading previous chat
    console.log('Loading chat:', chat);
  }

  logout(): void {
    this.authService.signOut()
      .then(() => {
        this.router.navigate(['/auth']);
      })
      .catch(error => {
        console.error('Logout error:', error);
      });
  }
}
