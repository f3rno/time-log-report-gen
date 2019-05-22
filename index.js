process.env.DEBUG = '*'

require('dotenv').config()

const debug = require('debug')('tl-report-gen')
const fs = require('fs')
const _last = require('lodash/last')
const _isEmpty = require('lodash/isEmpty')
const _isString = require('lodash/isString')
const _isFinite = require('lodash/isFinite')
const _uniq = require('lodash/uniq')
const _sum = require('lodash/sum')
const _min = require('lodash/min')
const _max = require('lodash/max')

const { HOURLY } = process.env
const inputFn = _last(process.argv)

if (!_isString(inputFn) || _isEmpty(inputFn)) {
  debug('JSON data filename required')
  process.exit(1)
}

if (_last(inputFn.split('.')) !== 'json') {
  debug('input file must be JSON [*.json] (got %s)', inputFn)
  process.exit(1)
}

const inputPathAbs = `${__dirname}/${inputFn}`

if (!fs.existsSync(inputPathAbs)) {
  debug('%s not found', inputFn)
  process.exit(1)
}

const dataJSON = fs.readFileSync(inputPathAbs, 'utf-8')
let data

try {
  data = JSON.parse(dataJSON)
} catch (e) {
  debug('invalid JSON provided: %s', e.message)
  process.exit(1)
}

// Supports: 1x, 0.2x, 0x, 1, 0.2, 0, and ^ suffix
const getCoeff = ({ note }) => {
  const coeffStr = note.split(' ')[0]
  const takePrevNote = coeffStr[coeffStr.length - 1] === '^'
  const coeff = _isFinite(+coeffStr)
    ? +coeffStr
    : +coeffStr.slice(0, coeffStr.length - (takePrevNote ? 2 : 1))

  return {
    takePrevNote,
    coeffStr: takePrevNote ? coeffStr.slice(0, coeffStr.length - 1) : coeffStr,
    c: coeff,
  }
}

const noteWithoutCoeff = note => {
  const items = note.split(' ')
  items.splice(0, 1)
  return items.join(' ')
}

// Get coeffs, process notes, dates
data.forEach((entry, i) => {
  entry.start = +(new Date(entry.start))
  entry.end = +(new Date(entry.end))
  entry.lenHours = (entry.end - entry.start) / (1000 * 60 * 60)
  entry.coeff = getCoeff(entry)

  const { takePrevNote, coeffStr } = entry.coeff

  if (takePrevNote) {
    if (i === 0) {
      debug('warning, cannot take previous note from first entry: %s', note)
    } else {
      const oldNote = entry.note
      entry.note = `${coeffStr} ${noteWithoutCoeff(data[i - 1].note)}`
    }
  }

  entry.trueNote = noteWithoutCoeff(entry.note)
})

const avgCoeff = _sum(data.map(e => e.coeff.c)) / data.length
const hours = _sum(data.map(({ lenHours }) => lenHours))
const reportStart = _min(data.map(({ start }) => start))
const reportEnd = _max(data.map(({ end }) => end))

debug(
  '* Report for %s -> %s (%d entries) *',
  new Date(reportStart).toLocaleString(),
  new Date(reportEnd).toLocaleString(),
  data.length
)
debug('')

debug('Average coeff: %f\%', avgCoeff * 100)
debug('Lowest coeff: %f\%', _min(data.map(({ coeff }) => coeff.c)) * 100)
debug('Highest coeff: %f\%', _max(data.map(({ coeff }) => coeff.c)) * 100)
debug('')
debug('Total hours: %f', hours)
debug('Total cost: %f', hours * avgCoeff * HOURLY)
debug('')
debug('Shortest session: %fh', _min(data.map(({ lenHours }) => lenHours)))
debug('Longest session: %fh', _max(data.map(({ lenHours }) => lenHours)))
debug('Avg session length: %fh', _sum(data.map(({ lenHours }) => lenHours)) / data.length)
debug('')
debug('Topics:')

_uniq(data.map(({ trueNote }) => trueNote)).forEach(note => (
  debug('  * %s', note)
))
