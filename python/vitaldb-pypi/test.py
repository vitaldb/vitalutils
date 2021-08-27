import vitaldb

trks = vitaldb.vital_trks("1.vital")
print(trks)

vals = vitaldb.vital_recs("https://vitaldb.net/samples/00001.vital", 'ART_MBP', return_timestamp=True)
print(vals)
