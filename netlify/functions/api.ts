import express from 'express';
import serverless from 'serverless-http';
import {createApiRouter} from '../../server/api';

const app = express();
app.use(express.json());

const apiRouter = createApiRouter();
app.use('/.netlify/functions/api', apiRouter);
app.use('/api', apiRouter);
app.use('/', apiRouter);

export const handler = serverless(app);
