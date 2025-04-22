import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mx-auto p-4">
      <h1 class="text-3xl font-bold mb-4">Welcome to Your PWA App</h1>
      <p class="mb-4">This is a Progressive Web App with AWS Cognito integration.</p>
      <div class="bg-blue-100 p-4 rounded-lg">
        <h2 class="text-xl font-semibold mb-2">Features</h2>
        <ul class="list-disc pl-5">
          <li>Responsive design</li>
          <li>AWS Cognito authentication</li>
          <li>PWA capabilities</li>
          <li>Consistent layout</li>
        </ul>
      </div>
    </div>
  `
})
export class HomeComponent {} 