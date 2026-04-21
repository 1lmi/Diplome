import React, { useMemo, useState } from "react";
import { api } from "../../api";
import type { IntegrationJob, IntegrationJobError } from "../../types";
import { useToast } from "../../ui/ToastProvider";

interface Props {
  jobs: IntegrationJob[];
  onRefresh: () => Promise<void> | void;
}

const labelMap: Record<string, string> = {
  csv: "CSV",
  "1c": "1C",
  flat: "Без размеров",
  variants: "С размерами",
  all: "Все",
  with_orders: "С заказами",
  period: "Период",
  products: "Товары",
  customers: "Покупатели",
  sales: "Продажи",
  import: "Импорт",
  export: "Экспорт",
  completed: "Готово",
  failed: "Ошибка",
  running: "В работе",
};

const getLabel = (value?: string | null) => {
  if (!value) return "—";
  return labelMap[value] || value;
};

const getStatusTone = (status: string) => {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  return "muted";
};

const summaryEntries = (summary: Record<string, unknown>) =>
  Object.entries(summary || {}).filter(([, value]) => value !== null && value !== undefined);

interface FilePickerProps {
  id: string;
  file: File | null;
  accept: string;
  onChange: (file: File | null) => void;
}

const FilePicker: React.FC<FilePickerProps> = ({ id, file, accept, onChange }) => (
  <div className="ie-file-picker">
    <input
      id={id}
      className="ie-file-picker__input"
      type="file"
      accept={accept}
      onChange={(e) => onChange(e.target.files?.[0] ?? null)}
    />
    <label htmlFor={id} className="btn btn--ghost ie-file-picker__button">
      Выбрать файл
    </label>
    <span className={`ie-file-picker__name${file ? "" : " ie-file-picker__name--empty"}`}>
      {file?.name || "Файл не выбран"}
    </span>
  </div>
);

const AdminImportsExportsPage: React.FC<Props> = ({ jobs, onRefresh }) => {
  const { pushToast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [productExportFormat, setProductExportFormat] = useState<"csv" | "1c">("csv");
  const [productMode, setProductMode] = useState<"flat" | "variants">("variants");
  const [productImportFile, setProductImportFile] = useState<File | null>(null);
  const [productImportFormat, setProductImportFormat] = useState<"csv" | "1c">("csv");
  const [productDryRun, setProductDryRun] = useState(true);
  const [allowPriceUpdates, setAllowPriceUpdates] = useState(true);
  const [preserveExistingSizes, setPreserveExistingSizes] = useState(false);

  const [customerFormat, setCustomerFormat] = useState<"csv" | "1c">("csv");
  const [customerScope, setCustomerScope] = useState<"all" | "with_orders" | "period">("all");
  const [customerDateFrom, setCustomerDateFrom] = useState("");
  const [customerDateTo, setCustomerDateTo] = useState("");
  const [customerImportFile, setCustomerImportFile] = useState<File | null>(null);
  const [customerDryRun, setCustomerDryRun] = useState(true);
  const [fallbackPhone, setFallbackPhone] = useState(false);

  const [salesFormat, setSalesFormat] = useState<"csv" | "1c">("csv");
  const [salesDateFrom, setSalesDateFrom] = useState("");
  const [salesDateTo, setSalesDateTo] = useState("");
  const [salesFinalizedOnly, setSalesFinalizedOnly] = useState(true);
  const [salesImportFile, setSalesImportFile] = useState<File | null>(null);
  const [salesDryRun, setSalesDryRun] = useState(true);

  const [selectedJobErrors, setSelectedJobErrors] = useState<IntegrationJobError[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const recentJobs = useMemo(() => jobs.slice(0, 20), [jobs]);

  const finishAction = async (job: IntegrationJob, successTitle: string) => {
    await onRefresh();
    if (job.artifact_url) {
      await api.downloadFile(job.artifact_url, job.artifact_filename ?? undefined);
    }
    pushToast({
      tone: job.status === "failed" ? "error" : "success",
      title: job.status === "failed" ? "Операция завершилась с ошибкой" : successTitle,
    });
  };

  const handleViewErrors = async (jobId: number) => {
    setBusyKey(`errors-${jobId}`);
    try {
      const data = await api.integrationJobErrors(jobId);
      setSelectedJobErrors(data);
      setSelectedJobId(jobId);
    } catch (error: any) {
      pushToast({ tone: "error", title: "Не удалось загрузить ошибки", description: error.message });
    } finally {
      setBusyKey(null);
    }
  };

  const runAction = async (key: string, action: () => Promise<IntegrationJob>, title: string) => {
    setBusyKey(key);
    try {
      const job = await action();
      await finishAction(job, title);
    } catch (error: any) {
      pushToast({ tone: "error", title: "Операция не выполнена", description: error.message });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="admin-page ie-shell">
      <div className="ie-toolbar">
        <h2 className="ie-title">Импорт / Экспорт</h2>
        <button className="btn btn--ghost" onClick={() => void onRefresh()}>
          Обновить
        </button>
      </div>

      <div className="ie-grid">
        <section className="ie-card">
          <div className="ie-card__title">Товары</div>
          <div className="ie-split">
            <div className="ie-block">
              <div className="ie-block__title">Экспорт</div>
              <div className="ie-fields">
                <label className="ie-field">
                  <span>Формат</span>
                  <select className="input" value={productExportFormat} onChange={(e) => setProductExportFormat(e.target.value as "csv" | "1c")}>
                    <option value="csv">CSV</option>
                    <option value="1c">1C</option>
                  </select>
                </label>
                <label className="ie-field">
                  <span>Режим</span>
                  <select className="input" value={productMode} onChange={(e) => setProductMode(e.target.value as "flat" | "variants")}>
                    <option value="flat">Без размеров</option>
                    <option value="variants">С размерами</option>
                  </select>
                </label>
              </div>
              <div className="ie-actions">
                <button
                  className="btn btn--primary"
                  disabled={busyKey === "export-products"}
                  onClick={() =>
                    void runAction(
                      "export-products",
                      () => api.exportProducts({ format: productExportFormat, mode: productMode }),
                      "Экспорт товаров готов"
                    )
                  }
                >
                  Скачать
                </button>
              </div>
            </div>

            <div className="ie-block">
              <div className="ie-block__title">Импорт</div>
              <div className="ie-fields">
                <label className="ie-field ie-field--full">
                  <span>Файл</span>
                  <FilePicker
                    id="product-import-file"
                    file={productImportFile}
                    accept={productImportFormat === "csv" ? ".csv,.xml" : ".xml"}
                    onChange={setProductImportFile}
                  />
                </label>
                <label className="ie-field">
                  <span>Формат</span>
                  <select className="input" value={productImportFormat} onChange={(e) => setProductImportFormat(e.target.value as "csv" | "1c")}>
                    <option value="csv">CSV</option>
                    <option value="1c">1C</option>
                  </select>
                </label>
                <label className="ie-check"><input type="checkbox" checked={productDryRun} onChange={(e) => setProductDryRun(e.target.checked)} /> Dry-run</label>
                <label className="ie-check"><input type="checkbox" checked={allowPriceUpdates} onChange={(e) => setAllowPriceUpdates(e.target.checked)} /> Обновлять цены</label>
                <label className="ie-check"><input type="checkbox" checked={preserveExistingSizes} onChange={(e) => setPreserveExistingSizes(e.target.checked)} /> Сохранять размеры</label>
              </div>
              <div className="ie-actions">
                <button
                  className="btn btn--secondary"
                  disabled={!productImportFile || busyKey === "import-products"}
                  onClick={() =>
                    productImportFile &&
                    void runAction(
                      "import-products",
                      () =>
                        api.importProducts({
                          file: productImportFile,
                          format: productImportFormat,
                          mode: productMode,
                          dry_run: productDryRun,
                          allow_price_updates: allowPriceUpdates,
                          preserve_existing_sizes: preserveExistingSizes,
                        }),
                      productDryRun ? "Dry-run товаров выполнен" : "Импорт товаров выполнен"
                    )
                  }
                >
                  {productDryRun ? "Проверить" : "Импортировать"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="ie-card">
          <div className="ie-card__title">Покупатели</div>
          <div className="ie-split">
            <div className="ie-block">
              <div className="ie-block__title">Экспорт</div>
              <div className="ie-fields">
                <label className="ie-field">
                  <span>Формат</span>
                  <select className="input" value={customerFormat} onChange={(e) => setCustomerFormat(e.target.value as "csv" | "1c")}>
                    <option value="csv">CSV</option>
                    <option value="1c">1C</option>
                  </select>
                </label>
                <label className="ie-field">
                  <span>Срез</span>
                  <select className="input" value={customerScope} onChange={(e) => setCustomerScope(e.target.value as "all" | "with_orders" | "period")}>
                    <option value="all">Все</option>
                    <option value="with_orders">С заказами</option>
                    <option value="period">Период</option>
                  </select>
                </label>
                <label className="ie-field">
                  <span>От</span>
                  <input className="input" type="date" value={customerDateFrom} onChange={(e) => setCustomerDateFrom(e.target.value)} />
                </label>
                <label className="ie-field">
                  <span>До</span>
                  <input className="input" type="date" value={customerDateTo} onChange={(e) => setCustomerDateTo(e.target.value)} />
                </label>
              </div>
              <div className="ie-actions">
                <button
                  className="btn btn--primary"
                  disabled={busyKey === "export-customers"}
                  onClick={() =>
                    void runAction(
                      "export-customers",
                      () =>
                        api.exportCustomers({
                          format: customerFormat,
                          scope: customerScope,
                          date_from: customerDateFrom || null,
                          date_to: customerDateTo || null,
                        }),
                      "Экспорт покупателей готов"
                    )
                  }
                >
                  Скачать
                </button>
              </div>
            </div>

            <div className="ie-block">
              <div className="ie-block__title">Импорт</div>
              <div className="ie-fields">
                <label className="ie-field ie-field--full">
                  <span>Файл</span>
                  <FilePicker
                    id="customer-import-file"
                    file={customerImportFile}
                    accept={customerFormat === "csv" ? ".csv,.xml" : ".xml"}
                    onChange={setCustomerImportFile}
                  />
                </label>
                <label className="ie-check"><input type="checkbox" checked={customerDryRun} onChange={(e) => setCustomerDryRun(e.target.checked)} /> Dry-run</label>
                <label className="ie-check"><input type="checkbox" checked={fallbackPhone} onChange={(e) => setFallbackPhone(e.target.checked)} /> Fallback по телефону</label>
              </div>
              <div className="ie-actions">
                <button
                  className="btn btn--secondary"
                  disabled={!customerImportFile || busyKey === "import-customers"}
                  onClick={() =>
                    customerImportFile &&
                    void runAction(
                      "import-customers",
                      () =>
                        api.importCustomers({
                          file: customerImportFile,
                          format: customerFormat,
                          dry_run: customerDryRun,
                          fallback_phone: fallbackPhone,
                        }),
                      customerDryRun ? "Dry-run покупателей выполнен" : "Импорт покупателей выполнен"
                    )
                  }
                >
                  {customerDryRun ? "Проверить" : "Импортировать"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="ie-card ie-card--wide">
          <div className="ie-card__title">Продажи</div>
          <div className="ie-split">
            <div className="ie-block">
              <div className="ie-block__title">Экспорт</div>
              <div className="ie-fields ie-fields--sales">
                <label className="ie-field">
                  <span>Формат</span>
                  <select className="input" value={salesFormat} onChange={(e) => setSalesFormat(e.target.value as "csv" | "1c")}>
                    <option value="csv">CSV / ZIP</option>
                    <option value="1c">1C</option>
                  </select>
                </label>
                <label className="ie-field">
                  <span>От</span>
                  <input className="input" type="date" value={salesDateFrom} onChange={(e) => setSalesDateFrom(e.target.value)} />
                </label>
                <label className="ie-field">
                  <span>До</span>
                  <input className="input" type="date" value={salesDateTo} onChange={(e) => setSalesDateTo(e.target.value)} />
                </label>
                <label className="ie-check"><input type="checkbox" checked={salesFinalizedOnly} onChange={(e) => setSalesFinalizedOnly(e.target.checked)} /> Только финальные</label>
              </div>
              <div className="ie-actions">
                <button
                  className="btn btn--primary"
                  disabled={busyKey === "export-sales"}
                  onClick={() =>
                    void runAction(
                      "export-sales",
                      () =>
                        api.exportSales({
                          format: salesFormat,
                          finalized_only: salesFinalizedOnly,
                          date_from: salesDateFrom || null,
                          date_to: salesDateTo || null,
                        }),
                      "Экспорт продаж готов"
                    )
                  }
                >
                  Скачать
                </button>
              </div>
            </div>

            <div className="ie-block">
              <div className="ie-block__title">Импорт</div>
              <div className="ie-fields">
                <label className="ie-field ie-field--full">
                  <span>Файл {salesFormat === "csv" ? "(ZIP)" : "(XML)"}</span>
                  <FilePicker
                    id="sales-import-file"
                    file={salesImportFile}
                    accept={salesFormat === "csv" ? ".zip,.xml" : ".xml"}
                    onChange={setSalesImportFile}
                  />
                </label>
                <label className="ie-check"><input type="checkbox" checked={salesDryRun} onChange={(e) => setSalesDryRun(e.target.checked)} /> Dry-run</label>
              </div>
              <div className="ie-actions">
                <button
                  className="btn btn--secondary"
                  disabled={!salesImportFile || busyKey === "import-sales"}
                  onClick={() =>
                    salesImportFile &&
                    void runAction(
                      "import-sales",
                      () => api.importSales({ file: salesImportFile, format: salesFormat, dry_run: salesDryRun }),
                      salesDryRun ? "Dry-run продаж выполнен" : "Импорт продаж выполнен"
                    )
                  }
                >
                  {salesDryRun ? "Проверить" : "Импортировать"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="ie-card ie-card--wide">
          <div className="ie-card__title">История</div>
          {recentJobs.length ? (
            <div className="ie-history">
              {recentJobs.map((job) => (
                <article key={job.id} className="ie-history__item">
                  <div className="ie-history__main">
                    <div className="ie-history__top">
                      <div className="ie-history__name">
                        #{job.id} · {getLabel(job.direction)} · {getLabel(job.entity_type)}
                      </div>
                      <span className={`ie-badge ie-badge--${getStatusTone(job.status)}`}>{getLabel(job.status)}</span>
                    </div>
                    <div className="ie-history__meta">
                      {getLabel(job.format)} · {job.profile} · {new Date(job.created_at).toLocaleString("ru-RU")}
                    </div>
                    {job.source_filename ? <div className="ie-history__meta">{job.source_filename}</div> : null}
                    {!!summaryEntries(job.summary).length && (
                      <div className="ie-summary">
                        {summaryEntries(job.summary).map(([key, value]) => (
                          <span key={key} className="ie-summary__item">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ie-actions ie-actions--history">
                    {job.artifact_url && (
                      <button
                        className="btn btn--ghost"
                        onClick={() =>
                          void api
                            .downloadFile(job.artifact_url || "", job.artifact_filename ?? undefined)
                            .catch((error: any) =>
                              pushToast({ tone: "error", title: "Не удалось скачать результат", description: error.message })
                            )
                        }
                      >
                        Результат
                      </button>
                    )}
                    {job.error_report_url && (
                      <button
                        className="btn btn--ghost"
                        onClick={() =>
                          void api
                            .downloadFile(job.error_report_url || "", job.error_report_filename ?? undefined)
                            .catch((error: any) =>
                              pushToast({ tone: "error", title: "Не удалось скачать файл ошибок", description: error.message })
                            )
                        }
                      >
                        Ошибки CSV
                      </button>
                    )}
                    <button
                      className="btn btn--ghost"
                      disabled={busyKey === `errors-${job.id}`}
                      onClick={() => void handleViewErrors(job.id)}
                    >
                      Ошибки API
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ie-empty">Пока пусто</div>
          )}
        </section>

        {selectedJobId && (
          <section className="ie-card ie-card--wide">
            <div className="ie-card__title">Ошибки #{selectedJobId}</div>
            {selectedJobErrors.length ? (
              <div className="ie-errors">
                {selectedJobErrors.map((item) => (
                  <div key={item.id} className="ie-error">
                    <div className="ie-error__top">
                      <strong>{item.error_code || "Ошибка"}</strong>
                      <span className="ie-summary__item">строка: {item.row_no ?? "—"}</span>
                    </div>
                    <div className="ie-history__meta">ключ: {item.entity_key ?? "—"}</div>
                    <div>{item.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ie-empty">Нет ошибок</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AdminImportsExportsPage;
