# 🌍 I18n Translate Hook

Professional internationalization (i18n) solution for Angular applications with reactive programming support.

## ✨ Features

- 🎯 **Singleton Pattern** - Single instance across the entire application
- 🔄 **Reactive Programming** - Observable & Signal support for automatic UI updates
- ⚡ **Performance Optimized** - Smart caching and lazy loading of translations
- 🛡️ **Type Safe** - Full TypeScript support with generic types
- 🎨 **Template Interpolation** - Support for parameterized translations (`{{0}}`, `{{1}}`)
- 🔄 **Fallback Language** - Automatic fallback when translation is missing
- 🧪 **Testing Friendly** - Built-in testing utilities
- 📦 **Zero Dependencies** - Only Angular and RxJS (already in your project)

## 🚀 Quick Start

### 1. Initialize (once in main.ts)

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { initializeI18n } from './app/translate-hook';

bootstrapApplication(AppComponent, {
  providers: [/* your providers */]
}).then(() => {
  // Initialize I18n after app bootstrap
  initializeI18n({
    injector: inject(Injector),
    assetsUrl: './assets/i18n',
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    languageSupported: ['en', 'vi', 'ja']
  });
});
```

### 2. Use anywhere in your app

```typescript
import { Component } from '@angular/core';
import { useI18nTranslate } from './translate-hook';

@Component({
  template: `
    <h1>{{ title }}</h1>
    <p>{{ greeting }}</p>
    <button (click)="switchLanguage()">Switch to Vietnamese</button>
  `
})
export class MyComponent {
  private translate = useI18nTranslate();
  
  title = this.translate.get('home.title');
  greeting = this.translate.get('home.greeting', 'John');
  
  switchLanguage() {
    this.translate.setLanguage('vi');
  }
}
```

## 📖 API Reference

### Core Functions

#### `initializeI18n(config: I18nConfig): I18nTranslateImplement`
Initialize the I18n system with default implementation.

```typescript
initializeI18n({
  injector,                    // Angular injector (required)
  assetsUrl: './assets/i18n',  // Path to translation files
  defaultLanguage: 'en',       // Default language
  fallbackLanguage: 'en',      // Fallback when translation missing
  languageSupported: ['en', 'vi'] // Supported languages
});
```

#### `useI18nTranslate(): I18nTranslate`
Get the singleton translate instance.

```typescript
const translate = useI18nTranslate();
```

### Translation Methods

#### Synchronous Translation
```typescript
// Simple translation
translate.get('welcome'); // "Welcome"

// With parameters
translate.get('greeting', 'John'); // "Hello, John!"

// Nested keys
translate.get('home.title'); // "Home Page"
```

#### Reactive Observable
```typescript
// Observable that updates when language changes
const message$ = translate.get$('welcome');

message$.subscribe(text => {
  console.log('Current translation:', text);
});

// With parameters
const greeting$ = translate.get$('greeting', 'John');
```

#### Angular Signals
```typescript
// Signal for reactive templates
const messageSignal = translate.getSignal('welcome');

@Component({
  template: `<h1>{{ messageSignal() }}</h1>` // Auto-updates on language change
})
export class MyComponent {
  messageSignal = this.translate.getSignal('welcome');
}
```

### Language Management

```typescript
// Switch language
translate.setLanguage('vi');

// Get current language
const current = translate.getCurrentLang(); // 'vi'

// Set supported languages
translate.setLanguageSupport(['en', 'vi', 'ja']);

// Get supported languages
const supported = translate.getLanguageSupport(); // ['en', 'vi', 'ja']
```

## 📁 Translation Files Structure

Create translation files in your assets folder:

```
src/assets/i18n/
├── en.json
├── vi.json
└── ja.json
```

### Example Translation Files

**en.json:**
```json
{
  "welcome": "Welcome",
  "greeting": "Hello, {{0}}!",
  "home": {
    "title": "Home Page",
    "description": "Welcome to our application"
  },
  "errors": {
    "network": "Network error occurred",
    "validation": "Please check your input"
  }
}
```

**vi.json:**
```json
{
  "welcome": "Chào mừng",
  "greeting": "Xin chào, {{0}}!",
  "home": {
    "title": "Trang chủ", 
    "description": "Chào mừng đến với ứng dụng của chúng tôi"
  },
  "errors": {
    "network": "Lỗi kết nối mạng",
    "validation": "Vui lòng kiểm tra thông tin nhập vào"
  }
}
```

## 🎯 Usage Patterns

### 1. Component Usage

```typescript
@Component({
  selector: 'app-home',
  template: `
    <!-- Static translation -->
    <h1>{{ pageTitle }}</h1>
    
    <!-- Reactive translation (auto-update on language change) -->
    <p>{{ welcomeMessage() }}</p>
    
    <!-- Using async pipe with Observable -->
    <div>{{ userGreeting$ | async }}</div>
    
    <!-- Language switcher -->
    <select (change)="onLanguageChange($event)">
      <option value="en">English</option>
      <option value="vi">Tiếng Việt</option>
    </select>
  `
})
export class HomeComponent {
  private translate = useI18nTranslate();

  // Static translation (update manually)
  pageTitle = this.translate.get('home.title');

  // Reactive signal (auto-update)
  welcomeMessage = this.translate.getSignal('welcome');

  // Observable translation
  userGreeting$ = this.translate.get$('greeting', 'John');

  constructor() {
    // Listen for language changes
    effect(() => {
      const lang = this.translate.currentLanguageSignal();
      this.pageTitle = this.translate.get('home.title');
    });
  }

  onLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.translate.setLanguage(target.value);
  }
}
```

### 2. Service Usage

```typescript
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private translate = useI18nTranslate();

  showError(errorKey: string, ...params: any[]) {
    const message = this.translate.get(`errors.${errorKey}`, ...params);
    // Show notification logic
  }

  // Reactive error messages
  getErrorMessage$(errorCode: string): Observable<string> {
    return this.translate.get$(`errors.${errorCode}`);
  }
}
```

## 🧪 Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { I18nInstance, initializeI18n } from './translate-hook';

describe('MyComponent', () => {
  beforeEach(() => {
    I18nInstance.reset();
    initializeI18n({
      injector: TestBed.inject(Injector),
      assetsUrl: './assets/test-i18n',
      defaultLanguage: 'en',
      fallbackLanguage: 'en',
      languageSupported: ['en']
    });
  });

  afterEach(() => {
    I18nInstance.reset();
  });
});
```

## 🎨 Template Interpolation

```json
{
  "welcome": "Welcome, {{0}}!",
  "notification": "You have {{0}} new messages and {{1}} pending tasks"
}
```

```typescript
translate.get('welcome', 'John'); // "Welcome, John!"
translate.get('notification', 5, 3); // "You have 5 new messages and 3 pending tasks"
```

## 🚀 Performance Tips

1. **Use Signals for Templates**: Prefer `getSignal()` in Angular templates
2. **Cache Static Translations**: Store frequently used translations in component properties
3. **Use Fallback**: Always configure a fallback language

## 📦 Development

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`.

## 🏗️ Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## 🧪 Running tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

---

Made with ❤️ for Angular developers
