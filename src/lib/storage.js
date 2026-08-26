// Fora do ambiente de artefato do Claude, localStorage é o mecanismo correto e padrão
// para persistência no navegador. Mantemos a mesma interface assíncrona (get/set/delete)
// usada em todo o restante do código para não precisar tocar em cada chamada individual.
const storage = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value !== null ? { key, value } : null;
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    window.localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

export default storage;
