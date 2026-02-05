import { createIntric } from "@intric/intric-js";
import type { LayoutLoad } from "./$types";
import { PUBLIC_INTRIC_BASE_URL } from "$env/static/public";

export const load: LayoutLoad = async ({ parent, fetch }) => {
  const baseUrl = PUBLIC_INTRIC_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "[widget] Missing PUBLIC_INTRIC_BASE_URL. Add it to your .env and restart dev server."
    );
  }

  const parentData: any = await parent().catch(() => ({}));
  const token: string | undefined = parentData?.tokens?.id_token;

  const intric = createIntric({
    token: token ?? "",
    baseUrl,
    fetch
  });

  return {
    intric
  };
};
