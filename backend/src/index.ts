import express, { type Express, type Request, type Response } from 'express';

const app: Express = express();
const port = 3000;

let counter: number = 0;

app.get('/', (req: Request, res: Response) => {
  counter++;
  res.send(`Hello World! You are ${counter}`);
  console.log(`${counter} number of requests`);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
