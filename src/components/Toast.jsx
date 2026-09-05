import React, { useState, useEffect } from 'react';
import { subscribeToast } from '../lib/toast.js';
import { IconCheckCircle } from './icons.jsx';

function ToastContainer(){
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribeToast((toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 2600);
    });
    return unsub;
  }, []);

  if(toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div className="toast-item" key={t.id}>
          <IconCheckCircle size={16} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export { ToastContainer };
