// Sistema simples de notificação "toast" — qualquer componente chama showToast(mensagem)
// sem precisar de Context ou prop-drilling. O <ToastContainer/> (montado uma vez em App.jsx)
// escuta e exibe.
let listeners = [];

function showToast(message){
  const toast = { id: Date.now() + Math.random(), message };
  listeners.forEach(fn => fn(toast));
}

function subscribeToast(fn){
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export { showToast, subscribeToast };
