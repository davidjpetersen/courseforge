import { store } from '../../_shared/store.js';

export async function GET() {
  const recipes = await store.listRecipes();
  return { statusCode: 200, body: JSON.stringify(recipes) };
}
