import { createClient } from "@supabase/supabase-js";
import {
  validateInput,
  type Item,
  type ItemInput,
} from "../features/shopping-list/model";
export interface Repository {
  mode: "shared" | "local";
  list(): Promise<Item[]>;
  add(input: ItemInput): Promise<void>;
  update(id: string, input: ItemInput): Promise<void>;
  toggle(id: string, purchased: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(refresh: () => void): () => void;
}
const storageKey = "fellowship-cart:v1";
export function localRepository(storage: Storage = localStorage): Repository {
  const read = (): Item[] => {
    const stored: unknown = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (
      !Array.isArray(stored) ||
      !stored.every((item: unknown) => {
        if (typeof item !== "object" || item === null) return false;
        const row = item as Record<string, unknown>;
        return (
          typeof row.id === "string" &&
          typeof row.name === "string" &&
          typeof row.quantity === "number" &&
          typeof row.unit === "string" &&
          typeof row.is_purchased === "boolean" &&
          typeof row.created_at === "string" &&
          typeof row.updated_at === "string"
        );
      })
    )
      throw new Error(
        "Saved local data is invalid. Export or clear this site's browser storage to recover.",
      );
    return stored as Item[];
  };
  const write = (items: Item[]) => {
    storage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new Event("cart-change"));
  };
  const change = (id: string, patch: Partial<Item>) =>
    write(
      read().map((item) =>
        item.id === id
          ? { ...item, ...patch, updated_at: new Date().toISOString() }
          : item,
      ),
    );
  return {
    mode: "local",
    async list() {
      return read();
    },
    async add(input) {
      const now = new Date().toISOString();
      write([
        ...read(),
        {
          ...validateInput(input),
          id: crypto.randomUUID(),
          is_purchased: false,
          created_at: now,
          updated_at: now,
        },
      ]);
    },
    async update(id, input) {
      change(id, validateInput(input));
    },
    async toggle(id, purchased) {
      change(id, { is_purchased: purchased });
    },
    async remove(id) {
      write(read().filter((item) => item.id !== id));
    },
    async clear() {
      write(read().filter((item) => !item.is_purchased));
    },
    subscribe(refresh) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) refresh();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener("cart-change", refresh);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("cart-change", refresh);
      };
    },
  };
}
export function createRepository(): Repository {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined;
  if (!url && !key) return localRepository();
  if (!url || !key)
    throw new Error(
      "Set both Supabase environment variables, or leave both empty for local mode.",
    );
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  async function check(
    result: PromiseLike<{ error: { message: string } | null }>,
  ) {
    const { error } = await result;
    if (error) throw new Error(error.message);
  }
  async function update(
    id: string,
    patch: Partial<ItemInput> | { is_purchased: boolean },
  ) {
    const { data, error } = await client
      .from("shopping_items")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length)
      throw new Error(
        "This item was removed on another device. Refresh the list.",
      );
  }
  return {
    mode: "shared",
    async list() {
      const { data, error } = await client
        .from("shopping_items")
        .select("*")
        .order("created_at");
      if (error) throw new Error(error.message);
      return data as Item[];
    },
    async add(input) {
      await check(client.from("shopping_items").insert(validateInput(input)));
    },
    async update(id, input) {
      await update(id, validateInput(input));
    },
    async toggle(id, purchased) {
      await update(id, { is_purchased: purchased });
    },
    async remove(id) {
      await check(client.from("shopping_items").delete().eq("id", id));
    },
    async clear() {
      await check(
        client.from("shopping_items").delete().eq("is_purchased", true),
      );
    },
    subscribe(refresh) {
      const channel = client
        .channel("shopping-list")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "shopping_items" },
          refresh,
        )
        .subscribe((state) => {
          if (state === "SUBSCRIBED") refresh();
        });
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
