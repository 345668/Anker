// Polyfill for Unframer which expects prefetchDNS in ReactDOM
// We import from the actual node_modules to avoid circular dependency with the alias
import ReactDOM from '../../node_modules/react-dom/index.js';

// Re-export everything from ReactDOM
export default ReactDOM;

// Polyfill missing functions
export const prefetchDNS = () => {};
export const preconnect = () => {};

// Re-export common named exports if needed (Vite/ESBuild usually handles CommonJS interop)
// But to be safe, we can manually export properties of the default export if they exist
export const createPortal = ReactDOM.createPortal;
export const findDOMNode = ReactDOM.findDOMNode;
export const flushSync = ReactDOM.flushSync;
export const hydrate = ReactDOM.hydrate;
export const render = ReactDOM.render;
export const unmountComponentAtNode = ReactDOM.unmountComponentAtNode;
export const unstable_batchedUpdates = ReactDOM.unstable_batchedUpdates;
export const unstable_renderSubtreeIntoContainer = ReactDOM.unstable_renderSubtreeIntoContainer;
export const version = ReactDOM.version;
