import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { Amplify } from 'aws-amplify';
import { awsConfig } from './config/aws-config';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';

// Configure AWS Amplify
try {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: awsConfig.userPoolId,
        userPoolClientId: awsConfig.userPoolClientId,
        signUpVerificationMethod: 'code'
      }
    }
  });
} catch (error) {
  console.warn('AWS Amplify configuration failed:', error);
  console.warn('Application will continue without authentication');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: true,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
