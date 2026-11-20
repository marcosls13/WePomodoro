let ranura = 8640;          // la memoria que guarda React (el estado)

function render() {
  const time = ranura;      // copia de la ranura en este momento
  return () => console.log("time:", time, "| ranura:", ranura);
}

const callback = render();  // render 1: crea una función que recuerda su `time`
ranura = 7640;              // setState cambió la ranura
render();                   // render 2: crea otro `time`, otra copia

callback();                 // imprime: time: 8640 | ranura: 7640
