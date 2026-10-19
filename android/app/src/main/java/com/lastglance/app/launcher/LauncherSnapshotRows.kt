package com.lastglance.app.launcher

import org.json.JSONArray
import org.json.JSONObject

/**
 * The launcher snapshot (src/native/launcherSnapshot.ts) as the rows the
 * [LauncherProvider] serves: one cursor per collection, each row the
 * collection's JSON object and its id. Pure over the JSON text so the mapping
 * is unit-tested on the JVM; the provider only adds the Android plumbing.
 *
 * Collections: `chores` and `people` (arrays of objects with an `id`) and
 * `meta` (one row: version, updatedAt, timezone, today, handledWrites).
 */
object LauncherSnapshotRows {

    const val AUTHORITY = "com.lastglance.app.launcher"

    val COLLECTIONS: Set<String> = setOf("chores", "people", "meta")

    /** The cursor's columns: a row number, the row's id, and the row as JSON. */
    val COLUMNS = arrayOf("_id", "id", "json")

    data class Row(val id: String, val json: String)

    /** The rows of [collection] in [snapshotJson], or null for an unknown collection. */
    fun rows(snapshotJson: String?, collection: String): List<Row>? {
        if (collection !in COLLECTIONS) return null
        if (snapshotJson.isNullOrEmpty()) return emptyList()
        val root = try { JSONObject(snapshotJson) } catch (e: Exception) { return emptyList() }
        return when (collection) {
            "meta" -> {
                val meta = JSONObject()
                for (key in listOf("version", "updatedAt", "timezone", "today", "handledWrites")) {
                    if (root.has(key)) meta.put(key, root.get(key))
                }
                listOf(Row("meta", meta.toString()))
            }
            else -> {
                val arr: JSONArray = root.optJSONArray(collection) ?: return emptyList()
                val out = ArrayList<Row>(arr.length())
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    out.add(Row(obj.optString("id", i.toString()), obj.toString()))
                }
                out
            }
        }
    }
}
