# Contributing to Pulse

Thank you for your interest in contributing to Pulse! We welcome contributions from the community to help make privacy-first analytics better for everyone.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/pulse.git
    cd pulse
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Set up environment variables**:
    Copy `.env.example` (if available) or create `.env.local` with the following:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8082
    NEXT_PUBLIC_AUTH_URL=http://localhost:3000
    NEXT_PUBLIC_AUTH_API_URL=http://localhost:8081
    NEXT_PUBLIC_APP_URL=http://localhost:3003
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...   # For embedded checkout (optional if billing not used)
    ```
5.  **Run the development server**:
    ```bash
    npm run dev
    ```

## Development Workflow

1.  Create a new branch for your feature or fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Make your changes.
3.  **Lint and Type Check**:
    Before committing, ensure your code passes our quality checks:
    ```bash
    npm run lint
    npm run type-check
    ```
4.  Commit your changes with a descriptive message.
5.  Push to your fork and submit a **Pull Request**.

## Code Style

-   We use **Next.js** with **TypeScript**.
-   Styling is done with **Tailwind CSS**.
-   Please follow the existing code style and conventions found in the project.
-   Ensure all new components are responsive and support dark mode.

## Pull Request Guidelines

-   Provide a clear description of what your PR does.
-   Link to any relevant issues.
-   Ensure all checks pass (linting, type checking).
-   If you are adding a new feature, please include screenshots or a video if applicable.

## License

By contributing to Pulse, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
