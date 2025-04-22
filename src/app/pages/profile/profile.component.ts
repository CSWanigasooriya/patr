import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold mb-6">Profile</h1>
      <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <div class="space-y-4">
          <div>
            <h2 class="text-xl font-semibold mb-2">Personal Information</h2>
            <p class="text-gray-600">Manage your personal information and preferences here.</p>
          </div>
          <!-- Profile content will go here -->
        </div>
      </div>
    </div>
  `
})
export class ProfileComponent {} 