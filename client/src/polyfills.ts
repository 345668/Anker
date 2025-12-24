import ReactDOM from 'react-dom';

// Polyfill for Unframer which expects prefetchDNS/preconnect in ReactDOM
// This fixes: (0, import_react_dom3.prefetchDNS) is not a function

// @ts-ignore
if (!ReactDOM.prefetchDNS) {
  // @ts-ignore
  ReactDOM.prefetchDNS = () => {};
}

// @ts-ignore
if (!ReactDOM.preconnect) {
  // @ts-ignore
  ReactDOM.preconnect = () => {};
}

console.log('ReactDOM polyfills loaded');
