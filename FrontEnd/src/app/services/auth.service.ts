import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, getCurrentUser } from 'aws-amplify/auth';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  private isAmplifyAvailable = false;

  constructor() {
    this.checkAmplifyAvailability();
    this.checkAuthState();
  }

  private checkAmplifyAvailability() {
    try {
      // Check if Amplify is properly configured
      if (Amplify.getConfig() && Amplify.getConfig().Auth) {
        this.isAmplifyAvailable = true;
      }
    } catch (error) {
      console.warn('AWS Amplify is not properly configured:', error);
      this.isAmplifyAvailable = false;
    }
  }

  private async checkAuthState() {
    if (!this.isAmplifyAvailable) {
      this.isAuthenticatedSubject.next(false);
      return;
    }

    try {
      await getCurrentUser();
      this.isAuthenticatedSubject.next(true);
    } catch {
      this.isAuthenticatedSubject.next(false);
    }
  }

  async signIn(username: string, password: string) {
    if (!this.isAmplifyAvailable) {
      console.warn('Authentication is not available. AWS Amplify is not properly configured.');
      this.isAuthenticatedSubject.next(false);
      return false;
    }

    try {
      const { isSignedIn } = await signIn({ username, password });
      this.isAuthenticatedSubject.next(isSignedIn);
      return isSignedIn;
    } catch (error) {
      console.error('Sign in error:', error);
      this.isAuthenticatedSubject.next(false);
      throw error;
    }
  }

  async signOut() {
    if (!this.isAmplifyAvailable) {
      console.warn('Authentication is not available. AWS Amplify is not properly configured.');
      this.isAuthenticatedSubject.next(false);
      return;
    }

    try {
      await signOut();
      this.isAuthenticatedSubject.next(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  async getCurrentUser() {
    if (!this.isAmplifyAvailable) {
      console.warn('Authentication is not available. AWS Amplify is not properly configured.');
      return null;
    }

    try {
      return await getCurrentUser();
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }
} 