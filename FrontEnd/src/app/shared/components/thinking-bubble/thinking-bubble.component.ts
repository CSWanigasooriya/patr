import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-thinking-bubble',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="thinking-bubble" [class.visible]="isVisible">
      <div class="dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </div>
  `,
  styles: [`
    .thinking-bubble {
      display: none;
      background: #f1f3f4;
      padding: 12px 16px;
      border-radius: 16px;
      margin: 8px 0;
      max-width: 70px;
      align-self: flex-start;

      &.visible {
        display: block;
      }

      :host-context(.dark-theme) & {
        background: #2d2d2d;
      }
    }

    .dots {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .dot {
      width: 8px;
      height: 8px;
      background: #6a0dad;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
      opacity: 0.9;

      :host-context(.dark-theme) & {
        background: #9747d4;
        opacity: 1;
      }

      &:nth-child(1) {
        animation-delay: 0s;
      }

      &:nth-child(2) {
        animation-delay: 0.2s;
      }

      &:nth-child(3) {
        animation-delay: 0.4s;
      }
    }

    @keyframes bounce {
      0%, 80%, 100% {
        transform: translateY(0);
      }
      40% {
        transform: translateY(-6px);
      }
    }
  `]
})
export class ThinkingBubbleComponent {
  @Input() isVisible: boolean = false;
} 