import React from 'react';
import ReactDOM from 'react-dom';
import './styles/main.scss';
import App from './App';
// import StartUp from './StartUp';
import reportWebVitals from './reportWebVitals';
import { OBSContextProvider } from "./OBS/context";

// ReactDOM.render(
//   <React.StrictMode>
//   <OBSContextProvider>
//     <StartUp />
//     </OBSContextProvider>
//   </React.StrictMode>,
//   document.getElementById('root')
// );

ReactDOM.render(
  <React.StrictMode>
  <OBSContextProvider>
    <App />
    </OBSContextProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
