# 3D Metallic ACM Logo

A React + Three.js project featuring a 3D metallic ACM logo with a revolving light source.

## Features

- **3D Metallic Logo**: The ACM logo is rendered in 3D with realistic metallic materials
- **Revolving Light**: A point light source revolves around the logo (invisible, only reflections visible)
- **Interactive**: Use mouse to rotate, zoom, and pan the view
- **Realistic Reflections**: Environment mapping creates authentic metallic reflections

## Technologies Used

- React 19
- Three.js
- React Three Fiber
- React Three Drei
- Vite

## Installation

```bash
npm install
```

## Running the Project

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Controls

- **Drag**: Rotate the view
- **Scroll**: Zoom in/out
- **Right-click + Drag**: Pan the view

## Project Structure

- `src/App.jsx` - Main application component with Canvas setup
- `src/ACMLogo3D.jsx` - 3D logo component with metallic materials and revolving light
- `public/fonts/` - Font files for 3D text rendering

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
