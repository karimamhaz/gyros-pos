import { useState } from "react";
import { useSession } from "../../app/session";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { saveFile } from "../../shared/bridge";
import type { Product } from "../../shared/types";
import {
  AmountField,
  Button,
  ChoiceField,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  Lbp,
  Segmented,
  Table,
  Tag,
  Usd,
  useAction,
  useLoad,
} from "../../shared/ui";
import { Head } from "./Head";
import { ImportPage } from "./ImportPage";

interface Category {
  id: string;
  name: string;
}
export interface FullMenu {
  categories: Category[];
  products: Product[];
}

export function ProductsPage() {
  const { t } = useI18n();
  const menu = useLoad(() => api.get<FullMenu>("/menu/all"));
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [categories, setCategories] = useState(false);
  const [importing, setImporting] = useState(false);
  const { busy, error, run } = useAction();

  if (importing) {
    return (
      <ImportPage
        onBack={() => {
          setImporting(false);
          void menu.reload();
        }}
      />
    );
  }
  const data = menu.data;
  const categoryName = (id: string) => data?.categories.find((c) => c.id === id)?.name;
  const download = (kind: "xlsx" | "csv") =>
    run(async () => saveFile(await api.blob(`/menu/export/${kind}`), `menu.${kind}`));

  return (
    <>
      <Head title={t("admin.products")}>
        <Button size="s" onClick={() => setCategories(true)}>
          {t("categories")}
        </Button>
        <Button size="s" onClick={() => setImporting(true)}>
          {t("import")}
        </Button>
        <Button size="s" disabled={busy} onClick={() => download("xlsx")}>
          {t("export.excel")}
        </Button>
        <Button size="s" disabled={busy} onClick={() => download("csv")}>
          {t("export.csv")}
        </Button>
        <Button
          size="s"
          variant="primary"
          disabled={!data?.categories.length}
          onClick={() => setEditing("new")}
        >
          {t("product.new")}
        </Button>
      </Head>
      <ErrorNote error={error ?? menu.error} />
      {data && !data.categories.length && <Empty>{t("products.start")}</Empty>}
      <div className="split scroll">
        {!!data?.products.length && (
          <div className="main-panel grid content-start">
            <Table head={[t("product"), t("category"), t("price"), t("status"), ""]}>
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>
                      <bdi>{p.name}</bdi>
                    </b>
                  </td>
                  <td>
                    <bdi>{categoryName(p.category_id)}</bdi>
                  </td>
                  <td>
                    <Lbp value={p.price_lbp} />
                  </td>
                  <td>
                    <Tag tone={p.available ? "good" : "bad"}>
                      {t(p.available ? "available" : "unavailable")}
                    </Tag>
                  </td>
                  <td>
                    <Button size="s" onClick={() => setEditing(p)}>
                      {t("edit")}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        {editing && data && (
          <ProductEditor
            key={editing === "new" ? "new" : editing.id}
            product={editing === "new" ? null : editing}
            categories={data.categories}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void menu.reload();
            }}
          />
        )}
      </div>
      {categories && data && (
        <CategoriesDialog
          categories={data.categories}
          reload={menu.reload}
          onClose={() => setCategories(false)}
        />
      )}
    </>
  );
}

function ProductEditor({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { settings } = useSession();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category_id ?? categories[0].id);
  const [price, setPrice] = useState(product?.price_lbp ?? 0);
  const [available, setAvailable] = useState(product?.available ?? true);
  const [deleting, setDeleting] = useState(false);
  const { busy, error, run } = useAction();

  return (
    <div className="box p-5 grid gap-3.5 content-start side-panel">
      <h2>{t(product ? "product.edit" : "product.new")}</h2>
      <Field label={t("name")} value={name} onChange={setName} maxLength={60} />
      <ChoiceField
        label={t("category")}
        value={category}
        options={categories.map((c) => [c.id, c.name])}
        onChange={setCategory}
      />
      <AmountField label={t("price")} currency="LBP" value={price} onChange={setPrice} />
      {settings.rate && price > 0 && (
        <p className="soft">
          {t("in_usd")} <Usd cents={Math.ceil((price * 100) / settings.rate)} />
        </p>
      )}
      <Segmented
        label={t("status")}
        options={[
          ["yes", t("available")],
          ["no", t("unavailable")],
        ]}
        value={available ? "yes" : "no"}
        onChange={(v) => setAvailable(v === "yes")}
      />
      <ErrorNote error={error} />
      <Button
        variant="dark"
        disabled={busy || !name.trim() || !price}
        onClick={() =>
          run(async () => {
            const body = { category_id: category, name, price_lbp: price, available };
            if (product) await api.put(`/menu/products/${product.id}`, body);
            else await api.post("/menu/products", body);
            onSaved();
          })
        }
      >
        {t("save")}
      </Button>
      <Button onClick={onClose}>{t("back")}</Button>
      {product && !deleting && (
        <Button variant="danger" onClick={() => setDeleting(true)}>
          {t("product.delete")}
        </Button>
      )}
      {product && deleting && (
        <>
          <p className="soft">{t("product.delete.hint")}</p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.delete(`/menu/products/${product.id}`);
                onSaved();
              })
            }
          >
            {t("delete.confirm")}
          </Button>
        </>
      )}
    </div>
  );
}

function CategoriesDialog({
  categories,
  reload,
  onClose,
}: {
  categories: Category[];
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Category | null>(null);
  const { busy, error, run } = useAction();
  const act = (work: () => Promise<unknown>) =>
    run(async () => {
      await work();
      setName("");
      setRenaming(null);
      await reload();
    });
  const move = (index: number, by: number) => {
    const ids = categories.map((c) => c.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return act(() => api.put("/menu/categories/order", { ids }));
  };

  return (
    <Dialog title={t("categories")} onClose={onClose}>
      <div className="grid gap-2 max-h-[340px] scroll">
        {categories.map((c, i) => (
          <div className="line" key={c.id}>
            <b className="flex-1">
              <bdi>{c.name}</bdi>
            </b>
            <Button
              size="s"
              aria-label={t("move.up")}
              disabled={busy || i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </Button>
            <Button
              size="s"
              aria-label={t("move.down")}
              disabled={busy || i === categories.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
            <Button
              size="s"
              onClick={() => {
                setRenaming(c);
                setName(c.name);
              }}
            >
              {t("edit")}
            </Button>
            <Button
              size="s"
              variant="danger"
              disabled={busy}
              onClick={() => act(() => api.delete(`/menu/categories/${c.id}`))}
            >
              {t("remove")}
            </Button>
          </div>
        ))}
      </div>
      <Field
        label={t(renaming ? "category.rename" : "category.new")}
        value={name}
        onChange={setName}
        maxLength={60}
      />
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button
          variant="dark"
          className="flex-1"
          disabled={busy || !name.trim()}
          onClick={() =>
            act(() =>
              renaming
                ? api.put(`/menu/categories/${renaming.id}`, { name })
                : api.post("/menu/categories", { name }),
            )
          }
        >
          {t(renaming ? "save" : "add")}
        </Button>
      </div>
    </Dialog>
  );
}
