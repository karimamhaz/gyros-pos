import { useState } from "react";
import { useI18n } from "../../i18n";
import { formatNumber } from "../../shared/format";
import type { MenuGroup, Product } from "../../shared/types";
import { Field, Ltr, Tag } from "../../shared/ui";

interface Props {
  menu: MenuGroup[];
  quantities: Record<string, number>;
  onPick: (product: Product) => void;
}

/** Grouped in the order of the printed menu, so staff find things where they expect them. */
export function MenuGrid({ menu, quantities, onPick }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const wanted = search.trim().toLowerCase();
  const groups = menu
    .map((g) => ({
      ...g,
      products: g.products.filter((p) => p.name.toLowerCase().includes(wanted)),
    }))
    .filter((g) => g.products.length);

  return (
    <>
      <div className="search">
        <Field label={t("search")} value={search} onChange={setSearch} placeholder={t("search")} />
      </div>
      <div className="cats scroll">
        {groups.map((group) => (
          <section className="cat" key={group.id}>
            <h3>
              <bdi>{group.name}</bdi>
            </h3>
            <div className="tiles">
              {group.products.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`tile ${quantities[p.id] ? "sel" : ""}`}
                  onClick={() => onPick(p)}
                >
                  <span>
                    <bdi>{p.name}</bdi>
                  </span>
                  <span className="price">
                    <Ltr>{formatNumber(p.price_lbp)}</Ltr>
                  </span>
                  {p.stock && p.stock !== "ok" && (
                    <span className="stock">
                      <Tag tone={p.stock === "out" ? "bad" : "warn"}>{t(`stock.${p.stock}`)}</Tag>
                    </span>
                  )}
                  {quantities[p.id] ? <i>{quantities[p.id]}</i> : null}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="soft">{t(menu.length ? "search.none" : "menu.empty")}</p>}
      </div>
    </>
  );
}
