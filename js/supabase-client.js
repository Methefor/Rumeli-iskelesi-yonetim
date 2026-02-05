
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://iwikwbjsznjuefvuemdb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3aWt3Ympzem5qdWVmdnVlbWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzkwNzEsImV4cCI6MjA4NTg1NTA3MX0.JLTiyDsrzcyEQEf_yS0cwUwtR3H1FaPl4mRFBRk142Q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Inserts a new sales record into Supabase
 * @param {Object} data - The sales data object
 * @returns {Promise<{data: any, error: any}>}
 */
export async function insertSalesRecord(data) {
  // Map frontend camelCase to database snake_case columns where necessary
  // or rely on frontend using same names if table columns match.
  // Based on request, table cols are: date, cashier_name, rumeliZ1, rumeliZ2, balikEkmek, dondurma, etc.
  
  const record = {
    date: data.selectedDate,
    cashier_name: data.cashierName,
    rumeliZ1: data.rumeliZ1,
    rumeliZ2: data.rumeliZ2,
    balikEkmek: data.balikEkmek,
    dondurma: data.dondurma,
    gida: data.gida,
    kahve: data.kahve,
    sicakIcecek: data.sicakIcecek,
    sogukIcecek: data.sogukIcecek,
    tatli: data.tatli,
    meyveSuyu: data.meyveSuyu,
    kahvalti: data.kahvalti,
    dondurmaAdet: data.dondurmaAdet,
    depo: data.depo,
    notlar: data.notlar,
    daily_target: data.dailyTarget,
    target_type: data.targetType
  }

  return await supabase.from('sales_records').insert([record]).select()
}

/**
 * Fetches sales records from Supabase
 * @returns {Promise<{data: any, error: any}>}
 */
export async function fetchSalesRecords() {
    // Determine the first day of the current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    // Format as YYYY-MM-DD
    const firstDayStr = firstDay.toISOString().split('T')[0];

    // Select * and order by date descending
    // Optionally filter by month here if needed, but dashboard does client-side filtering too.
    // Let's fetch all for now to support the "All Months" view, or limit to last 3 months if data grows.
    return await supabase
        .from('sales_records')
        .select('*')
        .order('date', { ascending: false })
}
